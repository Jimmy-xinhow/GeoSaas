const path = require('node:path');
const prismaModule = require.resolve('@prisma/client', {
  paths: [path.resolve(__dirname, '../apps/api')],
});
const { PrismaClient } = require(prismaModule);

const prisma = new PrismaClient();

async function main() {
  const grouped = await prisma.blogArticle.groupBy({
    by: ['title'],
    where: { published: true },
    _count: { title: true },
    orderBy: { _count: { title: 'desc' } },
  });
  const duplicates = grouped.filter((row) => row._count.title > 1);
  const sampleTitles = duplicates.slice(0, 20).map((row) => row.title);
  const sampleRows = sampleTitles.length
    ? await prisma.blogArticle.findMany({
        where: { published: true, title: { in: sampleTitles } },
        select: {
          slug: true,
          title: true,
          description: true,
          templateType: true,
          siteId: true,
          site: { select: { name: true } },
        },
        orderBy: [{ title: 'asc' }, { createdAt: 'desc' }],
      })
    : [];
  const published = await prisma.blogArticle.findMany({
    where: { published: true },
    select: { description: true },
  });
  const markdownDescriptions = published.filter((row) =>
    /(?:^|\s)(?:#{1,6}\s|\*\*|`|\[[^\]]+\]\([^)]+\)|\|[^|]+\|)/m.test(row.description),
  ).length;

  process.stdout.write(JSON.stringify({
    publishedArticles: published.length,
    duplicateTitleGroups: duplicates.length,
    duplicateTitleRows: duplicates.reduce((sum, row) => sum + row._count.title, 0),
    markdownDescriptions,
    samples: sampleRows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
