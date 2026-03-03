'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕捉到渲染錯誤:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="rounded-full bg-red-50 p-3">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    發生錯誤
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    頁面渲染時發生未預期的錯誤，請嘗試重新整理頁面。
                  </p>
                  {process.env.NODE_ENV === 'development' && this.state.error && (
                    <details className="mt-2 text-left">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-gray-700">
                        錯誤詳情（開發模式）
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-red-700">
                        {this.state.error.message}
                        {'\n'}
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={this.handleReset}>
                    重試
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={this.handleReload}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重新整理頁面
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
