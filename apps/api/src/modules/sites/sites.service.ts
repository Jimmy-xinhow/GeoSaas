import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSiteDto, userId: string) {
    return this.prisma.site.create({
      data: { ...dto, userId },
    });
  }

  async findAll(userId: string) {
    return this.prisma.site.findMany({
      where: { userId },
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true, createdAt: true } },
        _count: { select: { scans: true, monitors: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id, userId },
      include: {
        scans: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { scans: true, monitors: true, competitors: true } },
      },
    });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  async update(id: string, dto: UpdateSiteDto, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.site.delete({ where: { id } });
  }
}
