<?php
/**
 * Plugin Name: Geovault Auto Fix
 * Description: Pulls approved GEO repair actions from Geovault and installs AI-search structure on this WordPress site.
 * Version: 0.1.2
 * Author: Geovault
 */

if (!defined('ABSPATH')) {
    exit;
}

const GEOVAULT_AUTO_FIX_OPTION = 'geovault_auto_fix_settings';
const GEOVAULT_AUTO_FIX_HEAD = 'geovault_auto_fix_head_html';
const GEOVAULT_AUTO_FIX_FOOTER = 'geovault_auto_fix_footer_html';
const GEOVAULT_AUTO_FIX_LLMS = 'geovault_auto_fix_llms_txt';
const GEOVAULT_AUTO_FIX_APPLIED = 'geovault_auto_fix_applied_actions';

function geovault_auto_fix_default_settings() {
    return [
        'api_url' => 'https://api.geovault.app',
        'site_id' => '',
        'token' => '',
        'last_sync' => '',
        'last_error' => '',
    ];
}

function geovault_auto_fix_settings() {
    return array_merge(
        geovault_auto_fix_default_settings(),
        get_option(GEOVAULT_AUTO_FIX_OPTION, [])
    );
}

function geovault_auto_fix_save_settings($settings) {
    update_option(GEOVAULT_AUTO_FIX_OPTION, array_merge(geovault_auto_fix_settings(), $settings), false);
}

function geovault_auto_fix_request($method, $path, $body = null) {
    $settings = geovault_auto_fix_settings();
    if (empty($settings['api_url']) || empty($settings['site_id']) || empty($settings['token'])) {
        return new WP_Error('geovault_missing_config', 'Missing Geovault API URL, site id, or token.');
    }

    $url = rtrim($settings['api_url'], '/') . '/api' . $path;
    $args = [
        'method' => $method,
        'timeout' => 20,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Geovault-Token' => $settings['token'],
        ],
    ];
    if ($body !== null) {
        $args['body'] = wp_json_encode($body);
    }

    $response = wp_remote_request($url, $args);
    if (is_wp_error($response)) {
        return $response;
    }

    $code = wp_remote_retrieve_response_code($response);
    $raw = wp_remote_retrieve_body($response);
    $decoded = json_decode($raw, true);
    if ($code < 200 || $code >= 300) {
        return new WP_Error('geovault_http_error', 'Geovault API error: ' . $code . ' ' . $raw);
    }
    if (isset($decoded['success']) && array_key_exists('data', $decoded)) {
        return $decoded['data'];
    }
    return $decoded;
}

function geovault_auto_fix_report($action_id, $status, $message = '') {
    $settings = geovault_auto_fix_settings();
    return geovault_auto_fix_request(
        'POST',
        '/cms-fix/plugin/' . rawurlencode($settings['site_id']) . '/actions/' . rawurlencode($action_id) . '/result',
        [
            'status' => $status,
            'message' => $message,
        ]
    );
}

function geovault_auto_fix_store_html($option, $key, $html) {
    $items = get_option($option, []);
    if (!is_array($items)) {
        $items = [];
    }
    $items[$key] = $html;
    update_option($option, $items, false);
}

function geovault_auto_fix_apply_action($action) {
    if (empty($action['id']) || empty($action['type']) || empty($action['payload'])) {
        return new WP_Error('geovault_bad_action', 'Malformed action payload.');
    }

    $payload = $action['payload'];
    $html = isset($payload['html']) ? (string) $payload['html'] : '';
    $content = isset($payload['content']) ? (string) $payload['content'] : '';

    switch ($action['type']) {
        case 'install_json_ld':
        case 'install_og_tags':
        case 'install_faq_schema':
        case 'install_meta_description':
            geovault_auto_fix_store_html(GEOVAULT_AUTO_FIX_HEAD, $action['type'], $html);
            return true;

        case 'install_llms_txt':
            update_option(GEOVAULT_AUTO_FIX_LLMS, $content, false);
            flush_rewrite_rules(false);
            return true;

        case 'install_geo_badge':
        case 'install_crawler_tracking':
            geovault_auto_fix_store_html(GEOVAULT_AUTO_FIX_FOOTER, $action['type'], $html);
            return true;

        default:
            return new WP_Error('geovault_unknown_action', 'Unsupported action type: ' . $action['type']);
    }
}

function geovault_auto_fix_sync() {
    $settings = geovault_auto_fix_settings();
    $ping = geovault_auto_fix_request(
        'POST',
        '/cms-fix/plugin/' . rawurlencode($settings['site_id']) . '/ping',
        [
            'capabilities' => [
                'head_injection',
                'footer_injection',
                'llms_txt',
                'manual_sync',
                'scheduled_sync',
            ],
        ]
    );
    if (is_wp_error($ping)) {
        geovault_auto_fix_save_settings(['last_error' => $ping->get_error_message()]);
        return $ping;
    }

    $manifest = geovault_auto_fix_request(
        'GET',
        '/cms-fix/plugin/' . rawurlencode($settings['site_id']) . '/manifest'
    );
    if (is_wp_error($manifest)) {
        geovault_auto_fix_save_settings(['last_error' => $manifest->get_error_message()]);
        return $manifest;
    }

    $applied = get_option(GEOVAULT_AUTO_FIX_APPLIED, []);
    if (!is_array($applied)) {
        $applied = [];
    }

    $actions = isset($manifest['actions']) && is_array($manifest['actions']) ? $manifest['actions'] : [];
    $count = 0;
    foreach ($actions as $action) {
        $action_id = $action['id'];
        $result = geovault_auto_fix_apply_action($action);
        if (is_wp_error($result)) {
            geovault_auto_fix_report($action_id, 'failed', $result->get_error_message());
            continue;
        }
        $applied[$action_id] = current_time('mysql');
        geovault_auto_fix_report($action_id, 'applied', 'Installed by WordPress plugin.');
        $count++;
    }

    update_option(GEOVAULT_AUTO_FIX_APPLIED, $applied, false);
    geovault_auto_fix_save_settings([
        'last_sync' => current_time('mysql'),
        'last_error' => '',
    ]);

    return ['applied' => $count];
}

function geovault_auto_fix_cron_schedules($schedules) {
    if (!isset($schedules['geovault_five_minutes'])) {
        $schedules['geovault_five_minutes'] = [
            'interval' => 5 * MINUTE_IN_SECONDS,
            'display' => 'Every 5 minutes',
        ];
    }
    return $schedules;
}
add_filter('cron_schedules', 'geovault_auto_fix_cron_schedules');

function geovault_auto_fix_activate() {
    if (!wp_next_scheduled('geovault_auto_fix_cron_sync')) {
        wp_schedule_event(time() + MINUTE_IN_SECONDS, 'geovault_five_minutes', 'geovault_auto_fix_cron_sync');
    }
}
register_activation_hook(__FILE__, 'geovault_auto_fix_activate');

function geovault_auto_fix_deactivate() {
    wp_clear_scheduled_hook('geovault_auto_fix_cron_sync');
}
register_deactivation_hook(__FILE__, 'geovault_auto_fix_deactivate');

function geovault_auto_fix_cron_sync() {
    $settings = geovault_auto_fix_settings();
    if (empty($settings['api_url']) || empty($settings['site_id']) || empty($settings['token'])) {
        return;
    }
    geovault_auto_fix_sync();
}
add_action('geovault_auto_fix_cron_sync', 'geovault_auto_fix_cron_sync');

function geovault_auto_fix_output_head() {
    $items = get_option(GEOVAULT_AUTO_FIX_HEAD, []);
    if (!is_array($items)) {
        return;
    }
    foreach ($items as $html) {
        echo "\n" . $html . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
add_action('wp_head', 'geovault_auto_fix_output_head', 20);

function geovault_auto_fix_output_footer() {
    $items = get_option(GEOVAULT_AUTO_FIX_FOOTER, []);
    if (!is_array($items)) {
        return;
    }
    foreach ($items as $html) {
        echo "\n" . $html . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
add_action('wp_footer', 'geovault_auto_fix_output_footer', 20);

function geovault_auto_fix_maybe_serve_llms_txt() {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if ($path !== '/llms.txt') {
        return;
    }
    $content = get_option(GEOVAULT_AUTO_FIX_LLMS, '');
    if (!$content) {
        status_header(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo "# llms.txt not configured\n";
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    exit;
}
add_action('template_redirect', 'geovault_auto_fix_maybe_serve_llms_txt', 0);

function geovault_auto_fix_admin_menu() {
    add_options_page(
        'Geovault Auto Fix',
        'Geovault Auto Fix',
        'manage_options',
        'geovault-auto-fix',
        'geovault_auto_fix_settings_page'
    );
}
add_action('admin_menu', 'geovault_auto_fix_admin_menu');

function geovault_auto_fix_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $notice = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && check_admin_referer('geovault_auto_fix_save')) {
        geovault_auto_fix_save_settings([
            'api_url' => esc_url_raw($_POST['api_url'] ?? ''),
            'site_id' => sanitize_text_field($_POST['site_id'] ?? ''),
            'token' => sanitize_text_field($_POST['token'] ?? ''),
        ]);
        if (isset($_POST['sync_now'])) {
            $result = geovault_auto_fix_sync();
            $notice = is_wp_error($result)
                ? '<div class="notice notice-error"><p>' . esc_html($result->get_error_message()) . '</p></div>'
                : '<div class="notice notice-success"><p>同步完成，已套用 ' . intval($result['applied']) . ' 個修復項目。</p></div>';
        } else {
            $notice = '<div class="notice notice-success"><p>設定已儲存。</p></div>';
        }
    }

    $settings = geovault_auto_fix_settings();
    echo '<div class="wrap">';
    echo '<h1>Geovault Auto Fix</h1>';
    echo '<p>請貼上 Geovault 提供的 API URL、Site ID、Plugin Token。儲存後先按一次「立即同步修復」確認連線；之後外掛也會每 5 分鐘自動檢查是否有新的修復包。</p>';
    echo $notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    echo '<form method="post">';
    wp_nonce_field('geovault_auto_fix_save');
    echo '<table class="form-table"><tbody>';
    echo '<tr><th scope="row"><label for="api_url">API URL</label></th><td><input name="api_url" id="api_url" class="regular-text" value="' . esc_attr($settings['api_url']) . '"></td></tr>';
    echo '<tr><th scope="row"><label for="site_id">Site ID</label></th><td><input name="site_id" id="site_id" class="regular-text" value="' . esc_attr($settings['site_id']) . '"></td></tr>';
    echo '<tr><th scope="row"><label for="token">Plugin Token</label></th><td><input name="token" id="token" type="password" class="regular-text" value="' . esc_attr($settings['token']) . '"></td></tr>';
    echo '</tbody></table>';
    submit_button('儲存設定');
    submit_button('立即同步修復', 'primary', 'sync_now', false);
    echo '</form>';
    echo '<p>Last sync: ' . esc_html($settings['last_sync'] ?: 'never') . '</p>';
    if (!empty($settings['last_error'])) {
        echo '<p style="color:#b32d2e;">Last error: ' . esc_html($settings['last_error']) . '</p>';
    }
    echo '</div>';
}
