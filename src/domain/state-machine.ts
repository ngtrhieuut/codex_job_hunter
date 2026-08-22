import {
  type HumanGate,
  type HumanGateApproval,
  type JobState,
  type OpportunityLifecycleState,
  type StateStatus,
  type StateTransitionValidation,
  type WipStatus,
} from './types';

export const JOB_STATE_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = Object.freeze(
  {
    DISCOVERED: ['SCORED', 'REJECTED', 'ARCHIVED'],
    SCORED: ['SHORTLISTED', 'REJECTED', 'ARCHIVED'],
    SHORTLISTED: ['REQUIRES_APPLY_APPROVAL', 'REJECTED', 'ARCHIVED'],
    REQUIRES_APPLY_APPROVAL: ['APPLY_APPROVED', 'SHORTLISTED', 'REJECTED'],
    APPLY_APPROVED: ['APPLIED', 'REQUIRES_COMMERCIAL_DECISION', 'REJECTED'],
    APPLIED: ['CLIENT_RESPONSE', 'REQUIRES_COMMERCIAL_DECISION', 'CLOSED_LOST'],
    CLIENT_RESPONSE: ['REQUIRES_COMMERCIAL_DECISION', 'NEGOTIATING', 'CLOSED_LOST'],
    REQUIRES_COMMERCIAL_DECISION: ['NEGOTIATING', 'REJECTED', 'CLOSED_LOST'],
    NEGOTIATING: ['WON', 'REQUIRES_COMMERCIAL_DECISION', 'CLOSED_LOST'],
    WON: ['PLANNING', 'REJECTED'],
    PLANNING: ['IN_PROGRESS', 'BLOCKED_INTERNAL', 'BLOCKED_CLIENT', 'REQUIRES_SCOPE_APPROVAL'],
    IN_PROGRESS: [
      'BLOCKED_INTERNAL',
      'BLOCKED_CLIENT',
      'READY_FOR_INTERNAL_REVIEW',
      'REQUIRES_SCOPE_APPROVAL',
    ],
    BLOCKED_INTERNAL: ['IN_PROGRESS', 'READY_FOR_INTERNAL_REVIEW', 'REQUIRES_SCOPE_APPROVAL'],
    BLOCKED_CLIENT: ['IN_PROGRESS', 'REQUIRES_SCOPE_APPROVAL'],
    REQUIRES_SCOPE_APPROVAL: ['IN_PROGRESS', 'BLOCKED_INTERNAL', 'BLOCKED_CLIENT', 'REJECTED'],
    READY_FOR_INTERNAL_REVIEW: ['CHANGES_REQUESTED', 'READY_FOR_HUMAN_REVIEW', 'IN_PROGRESS'],
    CHANGES_REQUESTED: ['IN_PROGRESS', 'READY_FOR_INTERNAL_REVIEW'],
    READY_FOR_HUMAN_REVIEW: ['REQUIRES_DELIVERY_APPROVAL', 'CHANGES_REQUESTED'],
    REQUIRES_DELIVERY_APPROVAL: ['DELIVERED', 'CHANGES_REQUESTED'],
    DELIVERED: ['REVISION_REQUESTED', 'ACCEPTED'],
    REVISION_REQUESTED: ['IN_PROGRESS', 'READY_FOR_INTERNAL_REVIEW'],
    ACCEPTED: ['PAID', 'CLOSED_WON'],
    PAID: ['CLOSED_WON'],
    CLOSED_WON: ['ARCHIVED'],
    CLOSED_LOST: ['ARCHIVED'],
    REJECTED: ['ARCHIVED'],
    ARCHIVED: [],
  },
);

export const OPPORTUNITY_STATE_TRANSITIONS: Readonly<
  Record<OpportunityLifecycleState, readonly OpportunityLifecycleState[]>
> = Object.freeze({
  DISCOVERED: ['NORMALIZED', 'REJECTED_HARD_FILTER', 'CANCELLED'],
  NORMALIZED: ['SCORED', 'REJECTED_HARD_FILTER', 'CANCELLED'],
  REJECTED_HARD_FILTER: [],
  SCORED: ['SHORTLISTED', 'CANCELLED', 'REJECTED_HARD_FILTER'],
  SHORTLISTED: ['REQUIRES_APPLY_APPROVAL', 'CANCELLED'],
  REQUIRES_APPLY_APPROVAL: ['APPROVED_TO_APPLY', 'SHORTLISTED', 'CANCELLED'],
  APPROVED_TO_APPLY: ['APPLIED', 'CANCELLED'],
  APPLIED: ['LOST', 'WON_PENDING_CONTRACT', 'CANCELLED'],
  LOST: ['CANCELLED'],
  WON_PENDING_CONTRACT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SCOPE_CHANGE_REVIEW', 'READY_FOR_QA', 'CANCELLED'],
  SCOPE_CHANGE_REVIEW: ['ACTIVE', 'CANCELLED'],
  READY_FOR_QA: ['QA_FAILED', 'READY_FOR_DELIVERY'],
  QA_FAILED: ['ACTIVE', 'READY_FOR_QA', 'CANCELLED'],
  READY_FOR_DELIVERY: ['DELIVERED', 'QA_FAILED'],
  DELIVERED: ['REVISION', 'ACCEPTED'],
  REVISION: ['ACTIVE', 'DELIVERED'],
  ACCEPTED: ['PAID', 'CANCELLED'],
  PAID: ['CANCELLED'],
  CANCELLED: [],
});

const JOB_STATES = new Set<JobState>(Object.keys(JOB_STATE_TRANSITIONS) as JobState[]);
const OPPORTUNITY_STATES = new Set<OpportunityLifecycleState>(
  Object.keys(OPPORTUNITY_STATE_TRANSITIONS) as OpportunityLifecycleState[],
);

/** State that represents a pending owner decision, rather than an approval already granted. */
export const HUMAN_GATE_BY_STATE: Readonly<Partial<Record<StateStatus, HumanGate>>> = Object.freeze(
  {
    REQUIRES_APPLY_APPROVAL: 'APPLY',
    REQUIRES_COMMERCIAL_DECISION: 'PRICE',
    REQUIRES_SCOPE_APPROVAL: 'SCOPE_CHANGE',
    REQUIRES_DELIVERY_APPROVAL: 'DELIVERY',
  },
);

function isJobState(value: string): value is JobState {
  return JOB_STATES.has(value as JobState);
}

function isOpportunityState(value: string): value is OpportunityLifecycleState {
  return OPPORTUNITY_STATES.has(value as OpportunityLifecycleState);
}

function resolveEntity(
  from: string,
  to: string,
  requested?: 'job' | 'opportunity',
): 'job' | 'opportunity' {
  if (requested) return requested;
  if (
    to === 'NORMALIZED' ||
    to === 'REJECTED_HARD_FILTER' ||
    to === 'APPROVED_TO_APPLY' ||
    to === 'WON_PENDING_CONTRACT'
  ) {
    return 'opportunity';
  }
  if (
    from === 'NORMALIZED' ||
    from === 'REJECTED_HARD_FILTER' ||
    from === 'APPROVED_TO_APPLY' ||
    from === 'WON_PENDING_CONTRACT'
  ) {
    return 'opportunity';
  }
  return 'job';
}

export function getHumanGateForState(state: StateStatus): HumanGate {
  return HUMAN_GATE_BY_STATE[state] ?? 'NONE';
}

export function getRequiredHumanGate(
  from: StateStatus,
  to: StateStatus,
  entity?: 'job' | 'opportunity',
): HumanGate {
  const resolvedEntity = resolveEntity(from, to, entity);
  if (resolvedEntity === 'opportunity') {
    // Apply approval and contract acceptance are represented by the explicit
    // opportunity states in PRODUCT_SPEC rather than the job protocol states.
    if (to === 'APPROVED_TO_APPLY') return 'APPLY';
    if (from === 'SCOPE_CHANGE_REVIEW' && to === 'ACTIVE') return 'SCOPE_CHANGE';
    if (to === 'ACTIVE') return 'CONTRACT';
    if (to === 'DELIVERED') return 'DELIVERY';
    return 'NONE';
  }
  if (to === 'APPLY_APPROVED') return 'APPLY';
  if (to === 'NEGOTIATING') return 'PRICE';
  if (to === 'WON') return 'CONTRACT';
  if (from === 'REQUIRES_SCOPE_APPROVAL' && to === 'IN_PROGRESS') return 'SCOPE_CHANGE';
  if (to === 'DELIVERED') return 'DELIVERY';
  return 'NONE';
}

function invalidTransition(
  from: StateStatus,
  to: StateStatus,
  entity: 'job' | 'opportunity',
  reasonCode: StateTransitionValidation['reasonCode'],
  message: string,
  requiredHumanGate: HumanGate = 'NONE',
): StateTransitionValidation {
  return { valid: false, from, to, entity, requiredHumanGate, reasonCode, message };
}

export function validateTransition(
  from: StateStatus,
  to: StateStatus,
  options: {
    entity?: 'job' | 'opportunity';
    approval?: HumanGateApproval;
  } = {},
): StateTransitionValidation {
  const entity = resolveEntity(from, to, options.entity);
  const route = entity === 'job' ? JOB_STATE_TRANSITIONS : OPPORTUNITY_STATE_TRANSITIONS;
  const fromKnown = entity === 'job' ? isJobState(from) : isOpportunityState(from);
  const toKnown = entity === 'job' ? isJobState(to) : isOpportunityState(to);
  if (!fromKnown || !toKnown) {
    return invalidTransition(
      from,
      to,
      entity,
      'INVALID_STATE',
      'The source or target state is not valid for this entity.',
    );
  }

  const nextStates = route[from as never] as readonly string[];
  if (!nextStates.includes(to)) {
    return invalidTransition(
      from,
      to,
      entity,
      'TRANSITION_NOT_ALLOWED',
      `Transition ${from} -> ${to} is not allowed.`,
    );
  }

  const requiredHumanGate = getRequiredHumanGate(from, to, entity);
  if (requiredHumanGate !== 'NONE') {
    if (!options.approval?.approved) {
      return invalidTransition(
        from,
        to,
        entity,
        'HUMAN_GATE_REQUIRED',
        `Transition ${from} -> ${to} requires approved ${requiredHumanGate} gate.`,
        requiredHumanGate,
      );
    }
    if (options.approval.gate !== requiredHumanGate) {
      return invalidTransition(
        from,
        to,
        entity,
        'WRONG_HUMAN_GATE',
        `Expected ${requiredHumanGate} gate but received ${options.approval.gate}.`,
        requiredHumanGate,
      );
    }
  }

  return {
    valid: true,
    from,
    to,
    entity,
    requiredHumanGate,
    reasonCode: 'ALLOWED',
    message: `Transition ${from} -> ${to} is allowed.`,
  };
}

export function validateJobTransition(
  from: JobState,
  to: JobState,
  approval?: HumanGateApproval,
): StateTransitionValidation {
  return validateTransition(from, to, { entity: 'job', approval });
}

export function validateOpportunityTransition(
  from: OpportunityLifecycleState,
  to: OpportunityLifecycleState,
  approval?: HumanGateApproval,
): StateTransitionValidation {
  return validateTransition(from, to, { entity: 'opportunity', approval });
}

export function canTransition(
  from: StateStatus,
  to: StateStatus,
  options: { entity?: 'job' | 'opportunity'; approval?: HumanGateApproval } = {},
): boolean {
  return validateTransition(from, to, options).valid;
}

export function countInProgressJobs(states: readonly JobState[]): number {
  return states.reduce((count, state) => count + (state === 'IN_PROGRESS' ? 1 : 0), 0);
}

export function getWipStatus(states: readonly JobState[], limit = 3): WipStatus {
  const safeLimit = Math.max(0, Math.floor(Number.isFinite(limit) ? limit : 3));
  const activeCount = countInProgressJobs(states);
  return {
    activeCount,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - activeCount),
    withinLimit: activeCount <= safeLimit,
    canStart: activeCount < safeLimit,
  };
}

export function canStartInProgress(states: readonly JobState[], limit = 3): boolean {
  return getWipStatus(states, limit).canStart;
}

export const isTransitionAllowed = canTransition;
