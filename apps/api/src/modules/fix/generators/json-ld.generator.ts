import { Injectable } from '@nestjs/common';

export interface JsonLdInput {
  type: string;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  priceRange?: string;
  openingHours?: any;
  [key: string]: any;
}

@Injectable()
export class JsonLdGenerator {
  generate(data: JsonLdInput): string {
    const schema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': data.type || 'Organization',
      name: data.name,
      url: data.url,
    };

    if (data.description) schema.description = data.description;
    if (data.logo) schema.logo = data.logo;
    if (data.email) schema.email = data.email;
    if (data.phone) schema.telephone = data.phone;
    if (data.address) {
      schema.address = { '@type': 'PostalAddress', streetAddress: data.address };
    }

    if (data.type === 'LocalBusiness') {
      if (data.priceRange) schema.priceRange = data.priceRange;
      if (data.openingHours) schema.openingHoursSpecification = data.openingHours;
    }

    return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
  }
}
