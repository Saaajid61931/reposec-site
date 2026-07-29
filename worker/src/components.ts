export const SCAN_COMPONENTS = [
  "Repository posture",
  "GitHub Actions",
  "Secrets",
  "Dependencies",
  "Static analysis",
  "Deployed site",
] as const;

export type ScanComponentName = (typeof SCAN_COMPONENTS)[number];

export const FREE_SCAN_COMPONENTS: ScanComponentName[] = [
  "Repository posture",
  "GitHub Actions",
  "Secrets",
  "Dependencies",
  "Deployed site",
];

export function isScanComponentName(value: string): value is ScanComponentName {
  return SCAN_COMPONENTS.includes(value as ScanComponentName);
}
