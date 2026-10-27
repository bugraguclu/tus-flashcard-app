import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { alert, confirmAsync } from '../../lib/confirm';
import { occlusionImageField, occlusionImageFilename, parseOcclusionField } from '../../lib/imageOcclusion';
import ImageOcclusionEditorModal from './ImageOcclusionEditorModal';
import OcclusionShapesSvg from './OcclusionShapesSvg';
import { imageSize, mediaDisplayUri, pickOcclusionImage } from './occlusionMedia';
import type { Size } from './occlusionEditorModel';

interface Props {
    /** The note's Occlusion and Image fields. */
    occlusion: string;
    image: string;
    editable: boolean;
    onChange: (occlusion: string, image: string) => void;
}

const PREVIEW_MAX_HEIGHT = 340;

/**
 * The Occlusion and Image fields of an Image Occlusion note on the Add/Edit screen: the picture
 * with its masks, and the way into the mask editor. Header, Back Extra and Comments stay ordinary
 * fields below it, as in Anki.
 */
export default function ImageOcclusionFieldPanel({ occlusion, image, editable, onChange }: Props) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const filename = occlusionImageFilename(image);
    const [picture, setPicture] = useState<{ uri: string; natural: Size } | null | 'missing'>(null);
    const [width, setWidth] = useState(0);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const shapes = useMemo(() => parseOcclusionField(occlusion), [occlusion]);
    const masks = shapes.filter((shape) => shape.kind !== 'text');
    const cardCount = new Set(masks.map((shape) => shape.ordinal).filter((ordinal) => ordinal > 0)).size;

    useEffect(() => {
        let live = true;
        setPicture(null);
        if (!filename) return;
        (async () => {
            const uri = await mediaDisplayUri(filename);
            if (!uri) throw new Error('missing');
            const natural = await imageSize(uri);
            if (live) setPicture({ uri, natural });
        })().catch(() => {
            if (live) setPicture('missing');
        });
        return () => {
            live = false;
        };
    }, [filename]);

    const pick = async (source: 'library' | 'camera') => {
        if (masks.length > 0 && !(await confirmAsync(
            l('Görsel değiştirilsin mi?', 'Change the picture?'),
            l('Maskeler yeni görselde aynı oranlarda yerinde kalır.', 'The masks stay where they are, in proportion, on the new picture.'),
        ))) return;
        setBusy(true);
        try {
            const picked = await pickOcclusionImage(source, l);
            if (!picked) return;
            onChange(occlusion, occlusionImageField(picked.filename));
            if (masks.length === 0) setEditing(true);
        } catch (error) {
            console.warn('[ImageOcclusion] picking the picture failed:', error);
            alert(l('Hata', 'Error'), l('Görsel eklenemedi.', 'Could not add the picture.'));
        } finally {
            setBusy(false);
        }
    };

    const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
    const ready = picture && picture !== 'missing' ? picture : null;
    const preview = ready && width > 0
        ? (() => {
            const scale = Math.min(width / ready.natural.width, PREVIEW_MAX_HEIGHT / ready.natural.height);
            return { width: ready.natural.width * scale, height: ready.natural.height * scale };
        })()
        : null;

    const pickButtons = (
        <View style={styles.actions}>
            <ActionButton label={filename ? l('Görseli değiştir', 'Change Picture') : l('Galeriden görsel seç', 'Choose Picture')}
                onPress={() => pick('library')} styles={styles} primary={!filename} disabled={!editable || busy} />
            {Platform.OS !== 'web' && (
                <ActionButton label={l('Fotoğraf çek', 'Take Photo')} onPress={() => pick('camera')} styles={styles} disabled={!editable || busy} />
            )}
        </View>
    );

    return (
        <View style={styles.container} onLayout={onLayout}>
            {!filename ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{l('Örtülecek bir görsel seçin', 'Choose a picture to occlude')}</Text>
                    <Text style={styles.emptyText}>
                        {l('Görselin üzerine maskeler çizin; her maske (ya da grup) bir kart olur.',
                            'Draw masks over the picture; each mask (or group) becomes one card.')}
                    </Text>
                    {busy ? <ActivityIndicator color={colors.accent} /> : pickButtons}
                </View>
            ) : picture === 'missing' ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{l('Görsel bulunamadı', 'Picture not found')}</Text>
                    <Text style={styles.emptyText}>{filename}</Text>
                    {pickButtons}
                </View>
            ) : (
                <>
                    <TouchableOpacity
                        style={[styles.preview, preview && { width: preview.width, height: preview.height }]}
                        onPress={() => ready && setEditing(true)}
                        disabled={!ready || !editable}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Maskeleri düzenle, ${masks.length} maske`, `Edit masks, ${masks.length} masks`)}
                    >
                        {ready && preview ? (
                            <>
                                <Image source={{ uri: ready.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" accessibilityIgnoresInvertColors />
                                <OcclusionShapesSvg shapes={shapes} size={preview} natural={ready.natural} accent={colors.accent} />
                            </>
                        ) : (
                            <ActivityIndicator color={colors.accent} />
                        )}
                    </TouchableOpacity>
                    <Text style={styles.caption}>
                        {masks.length === 0
                            ? l('Henüz maske yok', 'No masks yet')
                            : l(`${masks.length} maske · ${cardCount} kart`, `${masks.length} masks · ${cardCount} cards`)}
                    </Text>
                    <View style={styles.actions}>
                        <ActionButton label={l('Maskeleri düzenle', 'Edit Masks')} onPress={() => setEditing(true)} styles={styles} primary
                            disabled={!ready || !editable} />
                        <ActionButton label={l('Görseli değiştir', 'Change Picture')} onPress={() => pick('library')} styles={styles}
                            disabled={!editable || busy} />
                    </View>
                </>
            )}
            {ready && (
                <ImageOcclusionEditorModal
                    visible={editing}
                    uri={ready.uri}
                    natural={ready.natural}
                    occlusion={occlusion}
                    onCancel={() => setEditing(false)}
                    onDone={(next) => {
                        setEditing(false);
                        if (next !== occlusion) onChange(next, image);
                    }}
                />
            )}
        </View>
    );
}

function ActionButton({ label, onPress, styles, primary, disabled }: {
    label: string; onPress: () => void; styles: ReturnType<typeof createStyles>; primary?: boolean; disabled?: boolean;
}) {
    return (
        <TouchableOpacity style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}
            onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}>
            <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { marginBottom: Spacing.md, gap: Spacing.sm },
        empty: {
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.border,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.sm,
            alignItems: 'center',
            backgroundColor: colors.bgCard,
        },
        emptyTitle: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
        emptyText: { color: colors.textSecondary, fontSize: FontSize.md, textAlign: 'center' },
        preview: {
            alignSelf: 'center',
            minHeight: 120,
            minWidth: 120,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
            backgroundColor: colors.bgInput,
        },
        caption: { color: colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
        actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
        button: {
            minHeight: 44,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.bgCard,
        },
        buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
        buttonDisabled: { opacity: 0.5 },
        buttonText: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
        buttonTextPrimary: { color: '#ffffff' },
    });
}
