import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { useThemeColors } from '../../constants/theme';
import type { AccountUser } from '../../lib/accountContract';
import { accountInitials } from '../../lib/accountSession';

/** The learner's initials in an accent circle, as iOS shows an account without a photo. */
export default function AccountAvatar({ user, size = 44 }: { user: Pick<AccountUser, 'name' | 'email'>; size?: number }) {
    const colors = useThemeColors();
    return (
        <View
            style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentLight }]}
            accessible={false}
        >
            <Text style={[styles.initials, { fontSize: Math.round(size * 0.38), color: colors.accent }]} allowFontScaling={false}>
                {accountInitials(user)}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    circle: { alignItems: 'center', justifyContent: 'center' },
    initials: { fontWeight: '700' },
});
