// reportAdapter.ts
//
// Bridges the two report data shapes in this project:
//   - TestRecord[]  (collected automatically by custom-report.ts from
//                    Playwright's own test/step results)
//   - StepResult[] + ReportMeta  (what excelReporter.ts / pdfReporter.ts
//                    expect — section/field rows plus a module/website/
//                    version header)
//
// Each test becomes a section (navy banner); each step within it becomes
// one row. Tests with no recorded steps still get a single row using the
// test's own title/status/duration.

import { TestRecord } from './reportBuilder';
import { ReportMeta, StepResult } from './reportTypes';

function capitalizeStatus(status: string): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : status;
  }
}

export function toStyledReport(records: TestRecord[]): { meta: ReportMeta; results: StepResult[] } {
  const first = records[0];
  const firstMeta = first?.reportMeta;

  const meta: ReportMeta = {
    formTitle: process.env.REPORT_TITLE || (records.length > 1 ? 'Combined Automation Test Report' : firstMeta?.formTitle || first?.title || 'Automation Test Report'),
    module: records.length > 1 ? 'Multiple tests' : firstMeta?.formTitle || first?.title || '',
    website: firstMeta?.websiteUrl || '',
    appVersion: process.env.REPORT_APP_VERSION || 'NA',
    appReleaseDate: process.env.REPORT_APP_RELEASE_DATE || 'NA',
    apiVersion: process.env.REPORT_API_VERSION || 'NA',
    apiReleaseDate: process.env.REPORT_API_RELEASE_DATE || 'NA',
  };

  const results: StepResult[] = [];

  records.forEach((record) => {
    const section = [record.file, record.reportMeta?.formTitle || record.title].filter(Boolean).join(' — ');

    if (record.steps.length === 0) {
      results.push({
        section,
        field: record.title,
        status: capitalizeStatus(record.status),
        duration: (record.durationMs / 1000).toFixed(2),
        error: record.error,
      });
      return;
    }

    record.steps.forEach((step) => {
      results.push({
        section,
        field: step.title,
        status: capitalizeStatus(step.status),
        duration: (step.durationMs / 1000).toFixed(2),
        error: step.error,
      });
    });
  });

  return { meta, results };
}
