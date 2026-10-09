export interface Env {
  ORIGIN_HOST: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  HONEYPOT_LIST_ID?: string;
  HONEYPOT_BAN_TTL_SECONDS?: string;
  HONEYPOT_MODE?: string;
  OTLP_ENDPOINT?: string;
  OTLP_AUTH?: string;
  DEPLOYMENT_ENVIRONMENT?: string;
}
