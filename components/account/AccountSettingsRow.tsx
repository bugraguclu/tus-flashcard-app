import React from 'react';
import { useRouter } from 'expo-router';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { Card } from '../ui/Card';
import { ListRow } from '../ui/Rows';

/**
 * The first row of Settings, where iOS keeps the Apple Account: the signed-in learner with their
 * address, or the way to sign in. Builds without an account server show nothing here.
 */
export default function AccountSettingsRow() {
    const router = useRouter();
    const { l } = useI18n();
    const { status, user } = useAccount();

    if (status === 'disabled') return null;
    if (status === 'signedIn' && user) {
        return (
            <Card>
                <ListRow
                    title={user.name}
                    summary={user.email}
                    onPress={() => router.push('/account' as never)}
                    accessibilityLabel={l(`Hesap: ${user.name}, ${user.email}`, `Account: ${user.name}, ${user.email}`)}
                    accessibilityHint={l('Hesap ayarlarını açar', 'Opens account settings')}
                />
            </Card>
        );
    }
    return (
        <Card>
            <ListRow
                title={l('Giriş yap', 'Sign in')}
                summary={l('İsteğe bağlı. Kartlarınız bu cihazda kalır.', 'Optional. Your cards stay on this device.')}
                onPress={() => router.push('/sign-in' as never)}
            />
        </Card>
    );
}
