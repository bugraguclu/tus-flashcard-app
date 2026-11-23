import React from 'react';
import { Platform, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { SegmentedControl } from '../ui/Choice';
import { ArrowDownIcon, ArrowUpIcon } from '../ui/icons';
import { Type } from '../ui/tokens';
import type { StatsColumnCount } from '../../lib/statsLayout';

export function StatsLayoutToolbar({ canChooseColumns, columns, onChangeColumns, canReset, onReset, onCancel, onSave, announcement, saving = false }: {
    canChooseColumns: boolean; columns: StatsColumnCount; onChangeColumns: (columns: StatsColumnCount) => void;
    canReset: boolean; onReset: () => void; onCancel: () => void; onSave: () => void; announcement: string; saving?: boolean;
}) {
    const { l } = useI18n(); const colors = useThemeColors();
    return <Card padded title={l('Bölüm düzenini özelleştir', 'Customize sections')}>
        <Text style={[Type.caption, { color: colors.textSecondary }]}>{l('Bölümleri taşıyın veya gizleyin. Değişiklikler Kaydet ile uygulanır.', 'Move or hide sections. Save applies your changes.')}</Text>
        {canChooseColumns ? <SegmentedControl options={[{ value: '1', label: l('1 sütun', '1 column') }, { value: '2', label: l('2 sütun', '2 columns') }]} value={String(columns)} onChange={(value) => onChangeColumns(value === '2' ? 2 : 1)} accessibilityLabel={l('Sütun düzeni', 'Column layout')} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
            <Button size="compact" variant="plain" label={l('Varsayılana dön', 'Reset defaults')} onPress={onReset} disabled={!canReset || saving} />
            <Button size="compact" variant="secondary" label={l('İptal', 'Cancel')} onPress={onCancel} disabled={saving} />
            <Button size="compact" label={l('Kaydet', 'Save')} onPress={onSave} busy={saving} />
        </View>
        {announcement ? <Text accessibilityLiveRegion="polite" style={[Type.caption, { color: colors.textSecondary }]}>{announcement}</Text> : null}
    </Card>;
}
export function StatsEditableCard({ title, index, total, hidden, canHide, onMoveUp, onMoveDown, onToggleVisible, children }: {
    title: string; index: number; total: number; hidden: boolean; canHide: boolean;
    onMoveUp: () => void; onMoveDown: () => void; onToggleVisible: () => void; children: React.ReactNode;
}) {
    const { l } = useI18n(); const colors = useThemeColors();
    const keyboard = Platform.OS === 'web' ? { tabIndex: 0, onKeyDown: (event: any) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); onMoveUp(); }
        if (event.key === 'ArrowDown' && index < total - 1) { event.preventDefault(); onMoveDown(); }
    } } as any : {};
    return <View style={{ gap: Spacing.sm }}>
        <Card padded>
            <View {...keyboard} accessibilityLabel={`${title}, ${index + 1} / ${total}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' }}>
                <Text style={[Type.bodyStrong, { flex: 1, color: colors.textPrimary }]}>{`${index + 1}. ${title}`}</Text>
                <IconButton accessibilityLabel={l(`${title} bölümünü yukarı taşı`, `Move ${title} up`)} onPress={onMoveUp} disabled={index === 0}><ArrowUpIcon color={colors.textSecondary} /></IconButton>
                <IconButton accessibilityLabel={l(`${title} bölümünü aşağı taşı`, `Move ${title} down`)} onPress={onMoveDown} disabled={index === total - 1}><ArrowDownIcon color={colors.textSecondary} /></IconButton>
                <Button size="compact" variant="secondary" label={hidden ? l('Göster', 'Show') : l('Gizle', 'Hide')} disabled={!hidden && !canHide} onPress={onToggleVisible} accessibilityLabel={hidden ? l(`${title} bölümünü göster`, `Show ${title}`) : l(`${title} bölümünü gizle`, `Hide ${title}`)} />
            </View>
        </Card>
        {!hidden ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View> : null}
    </View>;
}
