/**
 * CIRS Automation Attributes — section 4 (手書きメモ) and section 9 (operation-success).
 */
/**
 * Handwritten note-list readiness (deployed on staging): attribute on
 * {@link HANDWRITTEN_TEST_IDS.section}, not a separate loading test id.
 * `loaded` = fetch succeeded and note cards finished rendering (empty list OK).
 */
export const HANDWRITTEN_SECTION_LOAD_STATE_ATTR = 'data-load-state';

export const HANDWRITTEN_SECTION_LOAD_STATES = {
    loading: 'loading',
    loaded: 'loaded',
    error: 'error',
} as const;

export type HandwrittenSectionLoadState =
    (typeof HANDWRITTEN_SECTION_LOAD_STATES)[keyof typeof HANDWRITTEN_SECTION_LOAD_STATES];

export const HANDWRITTEN_TEST_IDS = {
    section: 'cirs-handwritten-section',
    create: 'cirs-handwritten-create',
    item: 'cirs-handwritten-item',
    editor: 'cirs-handwritten-editor',
    canvas: 'cirs-handwritten-canvas',
    save: 'cirs-handwritten-save',
    lastUpdated: 'cirs-handwritten-last-updated',
    delete: 'cirs-handwritten-delete',
    deleteDialog: 'cirs-delete-dialog',
    deleteConfirm: 'cirs-delete-confirm',
    operationSuccess: 'operation-success',
} as const;

/**
 * Section 4 drawing controls (CIR.spec.ts memo workflow).
 * Staging traces (e.g. 20261103-142050) show color/background chrome intercepting stage clicks;
 * there is no contracted `#drawing-toolbar` id — locate the toolbar by the shared container of
 * {@link HANDWRITTEN_DRAWING_TOOLBAR_ANCHORS}.
 */
export const HANDWRITTEN_DRAWING_CONTROLS = {
    colorBlack: 'cirs-handwritten-color-black',
    colorRed: 'cirs-handwritten-color-red',
    colorBlue: 'cirs-handwritten-color-blue',
    backgroundPlain: 'cirs-handwritten-background-plain',
    backgroundGrid: 'cirs-handwritten-background-grid',
    backgroundOutline: 'cirs-handwritten-background-outline',
    eraser: 'cirs-handwritten-eraser',
    reset: 'cirs-handwritten-reset',
} as const;

/** Contracted controls used to resolve the drawing toolbar container in staging and fixtures. */
export const HANDWRITTEN_DRAWING_TOOLBAR_ANCHORS = {
    colorBlack: HANDWRITTEN_DRAWING_CONTROLS.colorBlack,
    eraser: HANDWRITTEN_DRAWING_CONTROLS.eraser,
} as const;

export const NOTE_ID_ATTR = 'data-note-id';
export const CUSTOMER_SERVICE_ID_ATTR = 'data-customer-service-id';
export const ENTITY_TYPE_ATTR = 'data-entity-type';
export const ENTITY_ID_ATTR = 'data-entity-id';
export const OPERATION_ATTR = 'data-operation';

export const HANDWRITTEN_ENTITY_TYPE = 'handwritten-note';

/** Post-reopen canvas pixel equality is not asserted; see flow edit verification. */
export const HANDWRITTEN_CANVAS_REOPEN_VERIFICATION_GAP =
    'Exact cirs-handwritten-canvas pixel signature equality after save/reopen is not verified against staging rendering.';
