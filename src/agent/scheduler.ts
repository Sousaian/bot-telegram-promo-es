import { Cron } from "croner";
import type { JobReport } from "./agent.js";
import type { JobConfig } from "./config.js";

export interface RunOptions {
  /** Simula: escolhe as ofertas mas não publica nem marca como enviadas. */
  dryRun?: boolean | undefined;
}

export type JobRunner = (job: JobConfig, options: RunOptions) => Promise<JobReport>;

export interface ScheduledJobInfo {
  name: string;
  schedule: string;
  keywords: string[];
  enabled: boolean;
  running: boolean;
  nextRun: Date | null;
  lastReport?: JobReport | undefined;
}

/** Contrato usado pelo bot e pela API HTTP (evita acoplar com o JobScheduler). */
export interface JobsController {
  readonly timezone: string;
  list(): ScheduledJobInfo[];
  run(name: string, options?: RunOptions): Promise<JobReport>;
}

export class JobNotFoundError extends Error {
  constructor(name: string) {
    super(`job "${name}" não existe`);
    this.name = "JobNotFoundError";
  }
}

export class JobAlreadyRunningError extends Error {
  constructor(name: string) {
    super(`job "${name}" já está em execução`);
    this.name = "JobAlreadyRunningError";
  }
}

/** Formata uma data no fuso do config (ex.: 21/10/2026, 18:00). */
export function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(date);
}

/** Agenda os jobs via cron. Um job nunca roda em paralelo com ele mesmo. */
export class JobScheduler implements JobsController {
  private readonly crons = new Map<string, Cron>();
  private readonly running = new Set<string>();
  private readonly lastReports = new Map<string, JobReport>();

  constructor(
    private readonly jobs: JobConfig[],
    private readonly runner: JobRunner,
    readonly timezone: string,
    private readonly onReport: (r: JobReport) => void = () => {},
  ) {}

  start(): void {
    for (const job of this.jobs) {
      if (!job.enabled || this.crons.has(job.name)) continue;
      const cron = new Cron(job.schedule, { timezone: this.timezone, protect: true, name: job.name }, async () => {
        await this.run(job.name).catch(() => {});
      });
      this.crons.set(job.name, cron);
    }
  }

  stop(): void {
    for (const c of this.crons.values()) c.stop();
    this.crons.clear();
  }

  getJob(name: string): JobConfig | undefined {
    return this.jobs.find((j) => j.name === name);
  }

  /** Executa um job agora. Lança JobNotFoundError / JobAlreadyRunningError. */
  async run(name: string, options: RunOptions = {}): Promise<JobReport> {
    const job = this.getJob(name);
    if (!job) throw new JobNotFoundError(name);
    if (this.running.has(name)) throw new JobAlreadyRunningError(name);
    this.running.add(name);
    try {
      const report = await this.runner(job, { dryRun: options.dryRun ?? false });
      this.lastReports.set(name, report);
      this.onReport(report);
      return report;
    } catch (err) {
      console.error(`[scheduler] job ${name} falhou:`, err);
      throw err;
    } finally {
      this.running.delete(name);
    }
  }

  list(): ScheduledJobInfo[] {
    return this.jobs.map((job) => ({
      name: job.name,
      schedule: job.schedule,
      keywords: job.keywords,
      enabled: job.enabled,
      running: this.running.has(job.name),
      nextRun: this.crons.get(job.name)?.nextRun() ?? null,
      lastReport: this.lastReports.get(job.name),
    }));
  }
}
