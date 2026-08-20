import { CheckResult, CheckStatus } from '../core/types.ts';

export interface RemediationGuidance {
  checkId: string;
  checkName: string;
  status: CheckStatus;
  evidenceSummary: string;
  rootCauseAnalysis: string;
  recommendedOperatorSteps: string[];
  safeBootstrapActionAvailable: boolean;
}

/**
 * Deterministic Remediation Knowledge Base.
 * Maps deterministic check IDs and HTTP failure codes to precise, actionable troubleshooting guidance.
 */
export const REMEDIATION_KNOWLEDGE_BASE: Record<
  string,
  {
    title: string;
    rootCause: string;
    steps: string[];
    suggestsBootstrap: boolean;
  }
> = {
  chk_reachability: {
    title: 'Network Reachability Failure',
    rootCause: 'Target mock host or port is unreachable. The local process may be offline or listening on an unexpected port.',
    steps: [
      'Verify that the local mock development server is running on the designated port (default: 3000).',
      'Check firewall or local loopback restrictions blocking http://localhost.',
      'Ensure the mockBaseUrl in the Environment Profile matches the active server port.',
    ],
    suggestsBootstrap: false,
  },
  chk_health: {
    title: 'Microservice Health Degraded (HTTP 503)',
    rootCause: 'The target staging microservice returned a degraded health status code (503 Service Unavailable).',
    steps: [
      'Inspect target service logs for crash loops or unhandled exceptions.',
      'Confirm backing datastores and dependent microservices are healthy.',
      'Do not launch E2E test suites while health checks report degraded state to avoid false product regression alerts.',
    ],
    suggestsBootstrap: false,
  },
  chk_auth: {
    title: 'Authentication & Token Expiry (HTTP 401)',
    rootCause: 'The test runner service-account credentials or synthetic mock bearer token have expired or are missing valid scopes.',
    steps: [
      'Rotate or regenerate the service-account authentication token.',
      'Verify that required IAM permissions / scopes (read, write) are assigned to the test tenant.',
      'Ensure the authorization token is properly passed via the mock server headers.',
    ],
    suggestsBootstrap: false,
  },
  chk_records: {
    title: 'Prerequisite Test Seed Data Missing (HTTP 404)',
    rootCause: 'Required seed records (e.g. test user, organization tenant, or billing fixture) are missing from the test database.',
    steps: [
      'Review the approved setup actions configured in the active Environment Profile.',
      'Click "Approve & Run Bootstrap Setup" to automatically invoke the approved seed-data action.',
      'Verify the created test resource ID is registered in the Resource Ledger.',
    ],
    suggestsBootstrap: true,
  },
  chk_feature_flags: {
    title: 'Feature Flag Misconfiguration',
    rootCause: 'One or more required feature flags (e.g. "e2e-suite-enabled") are disabled or missing from the target flag configuration.',
    steps: [
      'Open the feature flag management console or mock flag configuration.',
      'Enable the required flag toggles for the target test environment.',
      'Re-run preflight checks to confirm the flags are active before launching tests.',
    ],
    suggestsBootstrap: false,
  },
};

/**
 * Evaluates check results and generates deterministic remediation guidance.
 * strictly read-only: does NOT mutate state or bypass approvals.
 */
export function generateRemediationGuidance(results: CheckResult[]): RemediationGuidance[] {
  const guidanceList: RemediationGuidance[] = [];

  for (const check of results) {
    if (check.status === CheckStatus.WARN || check.status === CheckStatus.BLOCK || check.status === CheckStatus.ERROR) {
      const template = REMEDIATION_KNOWLEDGE_BASE[check.checkId] || {
        title: `Issue in ${check.name}`,
        rootCause: check.evidence.details || 'Check did not pass validation.',
        steps: [check.remediation || 'Inspect service logs and retry preflight.'],
        suggestsBootstrap: false,
      };

      const evidenceSummary = check.evidence.statusCode
        ? `HTTP Status ${check.evidence.statusCode} (${check.evidence.responseTimeMs || 0}ms)`
        : check.evidence.details || 'No response details available';

      guidanceList.push({
        checkId: check.checkId,
        checkName: check.name,
        status: check.status,
        evidenceSummary,
        rootCauseAnalysis: template.rootCause,
        recommendedOperatorSteps: template.steps,
        safeBootstrapActionAvailable: template.suggestsBootstrap,
      });
    }
  }

  return guidanceList;
}
