import { StyleSheet, Platform } from 'react-native';
import { Spacing, FontSize, type ColorScheme } from '../../constants/theme';
import { Radius, Shadow, Type } from '../ui/tokens';

/**
 * Styles for the card browser, its rows, bars, menus and dialogs. `inset` is the extra side
 * padding that centres the toolbar, search, chips and list in a wide window (0 on a phone).
 */
export function createBrowserStyles(colors: ColorScheme, inset = 0) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    scopeToolbar: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: Spacing.lg + inset,
        paddingVertical: Spacing.sm,
    },
    scopeBlock: { flex: 1, minWidth: 0 },
    scopeSelector: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30, maxWidth: '100%' },
    scopeSelectorText: { flexShrink: 1, color: colors.accent, fontSize: FontSize.lg, fontWeight: '600' },
    scopeCount: { color: colors.textMuted, fontSize: FontSize.xs, marginTop: 1 },
    addCardBtn: { flexShrink: 0 },
    // The ⋮ keeps its dots where they were, a little into the gutter.
    moreButton: { flexShrink: 0, marginRight: -Spacing.sm },

    searchContainer: { paddingHorizontal: Spacing.lg + inset, marginBottom: Spacing.sm },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    searchField: { flex: 1 },
    searchDraftHint: { marginHorizontal: 4, marginTop: 4, fontSize: FontSize.xs, color: colors.textMuted },

    // flexGrow: 0 + centered content pin the chips to their natural size; otherwise the
    // row stretches into leftover space when the list below is short, inflating the chips.
    filterScroll: { minHeight: 42, maxHeight: 42, flexGrow: 0 },
    filterContent: { paddingHorizontal: Spacing.lg + inset, gap: Spacing.s6, alignItems: 'center' },

    list: { flex: 1 },
    listContent: { flexGrow: 1, paddingHorizontal: Spacing.md + inset, paddingVertical: Spacing.sm, gap: 3 },
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
        ...Shadow.card,
    },
    cardItemSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    // Anki tints the row instead of fading it: a suspended card is out of the queue, not less
    // worth reading. Fading it was the old treatment and made the text look washed out.
    cardSuspended: { backgroundColor: colors.rowSuspendedBg, borderColor: colors.streak },
    cardBuried: { backgroundColor: colors.rowBuriedBg },
    cardItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    // Centred on the row's height, like the selection circle in Mail's edit mode: the header
    // keeps its text top-aligned, but the box marks the whole row rather than its first line.
    selectionMark: { alignSelf: 'center' },
    cardBody: { flex: 1, minWidth: 0 },
    cardQuestion: { ...Type.rowTitle, color: colors.textPrimary, lineHeight: 20 },
    cardMeta: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.s6, marginTop: Spacing.xxs },
    cardTopic: { flex: 1, minWidth: 0, fontSize: FontSize.xs, lineHeight: 14, color: colors.textMuted },
    // The card's state, a plain word over the question (no pill): Learning or Review.
    stateLabel: { fontSize: FontSize.xs, lineHeight: 14, fontWeight: '600', marginBottom: 1 },
    scheduleMeta: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
    answerSnippet: { fontSize: FontSize.sm, color: colors.textSecondary, marginTop: Spacing.xxs, lineHeight: 18 },
    cardActions: {
        width: 24,
        flexShrink: 0,
        alignItems: 'center',
        gap: Spacing.xxs,
    },
    // The 44-point icon button, pulled in to the 24 points the pencil is given in the row.
    editBtn: { margin: -10 },
    // The marked star, the flag and the suspended mark at the row's end.
    statusIcon: { width: 24, height: 18, alignItems: 'center', justifyContent: 'center' },

    expandedContent: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
    answerBox: {
        backgroundColor: colors.bgInput,
        borderRadius: Radius.inset,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    // A quiet caption over the answer, in sentence case.
    answerLabel: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: 4,
    },
    answerContent: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 22 },
    cardDetails: { gap: 4, marginBottom: Spacing.sm },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailLabel: { fontSize: FontSize.sm, color: colors.textMuted },
    detailValue: { fontSize: FontSize.sm, color: colors.textPrimary, fontWeight: '500' },

    cardInfoBtn: { marginTop: Spacing.sm },

    // Lines the selection bar's actions up with the centred list in a wide window.
    selectionBarInset: { paddingHorizontal: inset },
    // The selection bar's leading control: the count of what is selected, which closes selection.
    // It takes twice an action's share of the bar, so the count stays readable.
    selectionBarCount: {
        flex: 2,
        minWidth: 80,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.s6,
        paddingLeft: Spacing.md,
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
        fontWeight: '600',
    },

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
    fieldLabel: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
    searchHelpList: { maxHeight: 420 },
    searchHelpGroupTitle: { marginTop: Spacing.md, marginBottom: 4 },
    searchHelpRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.s6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    searchHelpTerm: {
        flexShrink: 1,
        color: colors.accent,
        fontSize: FontSize.sm,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    searchHelpHint: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, textAlign: 'right' },
    directionRow: { flexDirection: 'row', gap: Spacing.sm },
    pickerList: { maxHeight: 430 },
    optionGroup: { gap: Spacing.sm },
    optionTitle: { ...Type.rowTitle, color: colors.textPrimary },
    optionCaption: { ...Type.caption, color: colors.textMuted },
    gradeRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
    gradeDot: { width: 12, height: 12, borderRadius: 6 },
    gradeText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
    // The card preview is a native page sheet: grabber, a header with × and the side switch, the
    // card, and Previous / Next along the bottom.
    previewContainer: { flex: 1, backgroundColor: colors.bgPrimary },
    previewGrabberArea: { height: 22, alignItems: 'center', paddingTop: 8, backgroundColor: colors.bgCard },
    previewGrabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
    previewHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
    // Holds the close button's place on iPhone, where the page sheet is pulled down instead.
    previewHeaderSide: { width: 44, height: 44 },
    previewTitle: { flex: 1, textAlign: 'center', ...Type.title, color: colors.textPrimary },
    previewBody: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
    previewNavigation: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgCard },
    previewNavButton: { flex: 1 },
    });
}

export type BrowserStyles = ReturnType<typeof createBrowserStyles>;
