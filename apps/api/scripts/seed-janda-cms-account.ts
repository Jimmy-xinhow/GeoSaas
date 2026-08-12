import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SITE_ID = 'cmn9128eo00pl8mq3391820gm';
const EXPECTED_URL = 'https://jimmy-xinhow.github.io/janda-auto/';

async function main() {
  const password = process.env.JANDA_MIO_INITIAL_PASSWORD;
  if (!password) throw new Error('JANDA_MIO_INITIAL_PASSWORD is required');
  if (password.length < 16 || password.length > 72) {
    throw new Error('JANDA_MIO_INITIAL_PASSWORD must contain 16 to 72 characters');
  }

  const site = await prisma.site.findUnique({ where: { id: SITE_ID } });
  if (!site || site.url !== EXPECTED_URL || site.name !== '詹大汽車精品') {
    throw new Error('Janda site identity did not match the approved site scope');
  }

  const existing = await prisma.siteCmsAccount.findUnique({
    where: { siteId_username: { siteId: SITE_ID, username: 'mio' } },
  });
  if (existing) {
    console.log('Janda CMS account already exists; password was not changed.');
    return;
  }

  await prisma.siteCmsAccount.create({
    data: {
      siteId: SITE_ID,
      username: 'mio',
      displayName: 'Mio',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      mustChangePassword: true,
    },
  });
  console.log('Janda CMS account created for username mio.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Janda CMS seed failed');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
