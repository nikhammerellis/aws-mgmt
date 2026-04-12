export interface AwsRegion {
  code: string
  label: string
}

export const AWS_REGIONS: AwsRegion[] = [
  { code: 'us-east-1', label: 'US East (N. Virginia)' },
  { code: 'us-east-2', label: 'US East (Ohio)' },
  { code: 'us-west-1', label: 'US West (N. California)' },
  { code: 'us-west-2', label: 'US West (Oregon)' },
  { code: 'af-south-1', label: 'Africa (Cape Town)' },
  { code: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { code: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { code: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  { code: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { code: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { code: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { code: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { code: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { code: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
  { code: 'ap-southeast-4', label: 'Asia Pacific (Melbourne)' },
  { code: 'ca-central-1', label: 'Canada (Central)' },
  { code: 'ca-west-1', label: 'Canada West (Calgary)' },
  { code: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { code: 'eu-central-2', label: 'Europe (Zurich)' },
  { code: 'eu-west-1', label: 'Europe (Ireland)' },
  { code: 'eu-west-2', label: 'Europe (London)' },
  { code: 'eu-west-3', label: 'Europe (Paris)' },
  { code: 'eu-north-1', label: 'Europe (Stockholm)' },
  { code: 'eu-south-1', label: 'Europe (Milan)' },
  { code: 'eu-south-2', label: 'Europe (Spain)' },
  { code: 'il-central-1', label: 'Israel (Tel Aviv)' },
  { code: 'me-central-1', label: 'Middle East (UAE)' },
  { code: 'me-south-1', label: 'Middle East (Bahrain)' },
  { code: 'sa-east-1', label: 'South America (São Paulo)' },
  { code: 'us-gov-east-1', label: 'AWS GovCloud (US-East)' },
  { code: 'us-gov-west-1', label: 'AWS GovCloud (US-West)' }
]

export const OUTPUT_FORMATS = ['json', 'table', 'text', 'yaml', 'yaml-stream'] as const
