import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { accountInitials } from '../../lib/accountSession';
import { PersonGlyph } from './AccountGlyphs';
import { useAccountPalette } from './accountPalette';

/**
 * The first row of Settings, where iOS keeps the Apple Account: the signed-in learner with their
 * address, or the way to sign in. Builds without an account server show nothing here.
 */
export default function AccountSettingsRow() {
    const router = useRouter();
    const { l } = useI18n();
    const colors = useThemeColors();
    const palette = useAccountPalette();
    const { status, user } = useAccount();

    const styles = useMemo(() => StyleSheet.create({
        card: {
            minHeight: 76,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            ...Shadows.sm,
        },
        avatar: {
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        initials: { fontSize: 18, fontWeight: '700', color: palette.link },
        copy: { flex: 1, minWidth: 0, gap: 2 },
        title: { fontSize: FontSize.lg + 1, fontWeight: '600', color: colors.textPrimary },
        subtitle: { fontSize: FontSize.sm + 1, lineHeight: 18, color: colors.textSecondary },
        arrow: { fontSize: 22, color: colors.textMuted, opacity: 0.6, paddingLeft: Spacing.sm },
    }), [colors, palette.link]);

    if (status === 'disabled') return null;
    const signedIn = status === 'signedIn' && user !== null;
    const title = signedIn ? user.name : l('Giriş yap veya hesap oluştur', 'Sign in or create an account');
    const subtitle = signedIn
        ? user.email
        : l('Kartlarınız ve çalışmanız yine bu cihazda kalır', 'Your cards and study still stay on this device');

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push((signedIn ? '/account' : '/sign-in') as never)}
            accessibilityRole="button"
            accessibilityLabel={signedIn ? l(`Hesap: ${user.name}, ${user.email}`, `Account: ${user.name}, ${user.email}`) : title}
            accessibilityHint={signedIn ? l('Hesap ayarlarını açar', 'Opens account settings') : subtitle}
        >
            <View style={styles.avatar}>
                {signedIn
                    ? <Text style={styles.initials} allowFontScaling={false}>{accountInitials(user)}</Text>
                    : <PersonGlyph color={palette.link} size={24} />}
            </View>
            <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
            </View>
            <Text style={styles.arrow} accessible={false}>›</Text>
        </TouchableOpacity>
    );
}
