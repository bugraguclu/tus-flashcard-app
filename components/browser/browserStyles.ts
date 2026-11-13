import { StyleSheet, Platform } from 'react-native';
import { Spacing, FontSize, Shadows, type ColorScheme } from '../../constants/theme';
import { DISABLED_OPACITY, Radius, Type } from '../ui/tokens';

/** Styles for the card browser, its rows, bars, menus and dialogs. */
export function createBrowserStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    scopeToolbar: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    scopeBlock: { flex: 1, minWidth: 0 },
    scopeSelector: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30, maxWidth: '100%' },
    scopeSelectorText: { flexShrink: 1, color: colors.accent, fontSize: FontSize.lg, fontWeight: '800' },
    scopeCount: { color: colors.textMuted, fontSize: FontSize.xs, marginTop: 1 },
    addCardBtn: { flexShrink: 0 },
    // The ⋮ keeps its dots where they were, a little into the gutter.
    moreButton: { flexShrink: 0, marginRight: -Spacing.sm },

    searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    searchField: { flex: 1 },
    searchDraftHint: { marginHorizontal: 4, marginTop: 4, fontSize: FontSize.xs, color: colors.textMuted },

    // flexGrow: 0 + centered content pin the chips to their natural size; otherwise the
    // row stretches into leftover space when the list below is short, inflating the chips.
    filterScroll: { minHeight: 42, maxHeight: 42, flexGrow: 0 },
    filterContent: { paddingHorizontal: Spacing.lg, gap: 6, alignItems: 'center' },

    list: { flex: 1 },
    listContent: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
    // Centred in the space the list leaves when it has nothing to show.
    emptyState: { flex: 1 },

    cardItem: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Radius.card,
        borderCurve: 'continuous',
        paddingVertical: 4,
        paddingHorizontal: Spacing.md - 2,
        ...Shadows.sm,
    },
    cardItemSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    // Anki tints the row instead of fading it: a suspended card is out of the queue, not less
    // worth reading. Fading it was the old treatment and made the text look washed out.
    cardSuspended: { backgroundColor: colors.rowSuspendedBg, borderColor: colors.streak },
    cardBuried: { backgroundColor: colors.rowBuriedBg },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardIcon: { fontSize: 17, marginTop: 1 },
    cardBody: { flex: 1, minWidth: 0 },
    cardQuestion: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },
    cardMeta: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    cardTopic: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 14, color: colors.textMuted },
    statusDot: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.pill },
    statusDotText: { fontSize: 9, fontWeight: '600' },
    scheduleMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
    answerSnippet: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
    cardActions: {
        width: 24,
        flexShrink: 0,
        alignItems: 'center',
        gap: 2,
    },
    editBtn: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // The marked star, the flag and the suspended mark at the row's end.
    statusIcon: { width: 24, height: 18, alignItems: 'center', justifyContent: 'center' },

    expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
    answerBox: {
        backgroundColor: colors.bgInput,
        borderRadius: Radius.inset,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    answerLabel: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1,
        color: colors.accent,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    answerContent: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 22 },
    cardDetails: { gap: 4, marginBottom: Spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: FontSize.sm, color: colors.textMuted },
    detailValue: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '500' },

    selectionBar: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingBottom: Spacing.xs,
        backgroundColor: colors.bgCard,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        ...Shadows.lg,
    },
    selectionBarCount: {
        flex: 1,
        minWidth: 80,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.xs,
    },
    selectionBarCloseBox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionBarCountText: {
        flex: 1,
        color: colors.textPrimary,
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    selectionActionsGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    selectionAction: {
        width: 60,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.control,
    },
    selectionActionDisabled: { opacity: DISABLED_OPACITY },
    selectionActionIconBox: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionActionText: {
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: '600',
        marginTop: 3,
        textAlign: 'center',
    },

    // A Browse ••• row with something at its end: laid out as the shared `MenuItem` is.
    menuItem: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    menuItemIcon: { width: 22, alignItems: 'center' },
    menuItemLabel: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '500' },
    menuBadge: { alignSelf: 'center' },
    flagIconContainer: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flagFilterPanel: {
        marginHorizontal: Spacing.sm,
        marginBottom: Spacing.xs,
        overflow: 'hidden',
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Radius.inset,
    },
    flagFilterCount: { ...Type.caption, color: colors.textMuted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },

    // Dialog content: the shared dialog draws the card, title, message and actions.
    dialogNote: { ...Type.caption, color: colors.textMuted },
    dialogField: { gap: Spacing.xs },
    // A checkbox or switch row inside a dialog: the dialog's own padding is its inset.
    dialogRow: { paddingHorizontal: 0 },
    fieldLabel: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
    searchHelpList: { maxHeight: 420 },
    searchHelpGroupTitle: { marginTop: Spacing.md, marginBottom: 4 },
    searchHelpRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    searchHelpTerm: {
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchHelpHint: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, textAlign: 'right' },
    directionRow: { flexDirection: 'row', gap: Spacing.sm },
    pickerList: { maxHeight: 430 },
    pickerRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    pickerRowActive: { backgroundColor: colors.accentLight },
    pickerRowText: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
    pickerRowTextActive: { color: colors.accent, fontWeight: '800' },
    optionGroup: { gap: Spacing.sm },
    optionTitle: { ...Type.rowTitle, color: colors.textPrimary },
    optionCaption: { ...Type.caption, color: colors.textMuted },
    gradeRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
    gradeDot: { width: 12, height: 12, borderRadius: 6 },
    gradeText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
    // The card preview is a native page sheet: grabber, a header with × and the side switch, the
    // card, and Previous / Next along the bottom.
    previewContainer: { flex: 1, backgroundColor: colors.bgPrimary },
    previewGrabberArea: { height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
    previewGrabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
    previewHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
    previewTitle: { flex: 1, textAlign: 'center', ...Type.title, color: colors.textPrimary },
    previewBody: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
    previewNavigation: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgCard },
    previewNavButton: { flex: 1 },
    });
}

export type BrowserStyles = ReturnType<typeof createBrowserStyles>;
