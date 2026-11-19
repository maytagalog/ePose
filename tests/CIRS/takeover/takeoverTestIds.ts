/**
 * CIRS Automation Attributes — section 5 (引き継ぎ / handover) and section 9 (operation-success).
 */
export const HANDOVER_TEST_IDS = {
    section: 'cirs-handover-section',
    create: 'cirs-handover-create',
    listOpen: 'cirs-handover-list-open',
    list: 'cirs-handover-list',
    item: 'cirs-handover-item',
    editor: 'cirs-handover-editor',
    content: 'cirs-handover-content',
    date: 'cirs-handover-date',
    assignee: 'cirs-handover-assignee',
    submit: 'cirs-handover-submit',
    update: 'cirs-handover-update',
    delete: 'cirs-handover-delete',
    back: 'cirs-handover-back',
    empty: 'cirs-handover-empty',
    operationSuccess: 'operation-success',
} as const;

/** @deprecated Use HANDOVER_TEST_IDS — kept for incremental import renames. */
export const TAKEOVER_TEST_IDS = HANDOVER_TEST_IDS;

export const HANDOVER_ID_ATTR = 'data-handover-id';
export const CUSTOMER_ID_ATTR = 'data-customer-id';
export const CUSTOMER_SERVICE_ID_ATTR = 'data-customer-service-id';
export const ENTITY_TYPE_ATTR = 'data-entity-type';
export const OPERATION_ATTR = 'data-operation';

export const HANDOVER_ENTITY_TYPE = 'handover';

/** Preview (cirs-handover-section) and full list (cirs-handover-list) load hooks. */
export const HANDOVER_SECTION_LOAD_STATE_ATTR = 'data-load-state';

export const HANDOVER_SECTION_LOAD_STATES = {
    loading: 'loading',
    loaded: 'loaded',
    error: 'error',
} as const;

export type HandoverSectionLoadState =
    (typeof HANDOVER_SECTION_LOAD_STATES)[keyof typeof HANDOVER_SECTION_LOAD_STATES];
