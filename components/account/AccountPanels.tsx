import React, { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    hasIssues,
    validateName,
    validatePasswordChange,
    type AccountFieldIssues,
    type AccountFieldName,
    type AccountUser,
} from '../../lib/accountContract';
import { isAccountRequestError, AccountRequestError } from '../../lib/accountApi';
import { accountErrorMessage, accountFieldMessage } from '../../lib/accountMessages';
import { useAccount } from '../../contexts/AccountContext';
import { useI18n } from '../../hooks/useI18n';
import { requestAppleCredential } from '../../lib/appleSignIn';
import { requestGoogleIdToken } from '../../lib/googleSignIn';
import { Button } from '../ui/Button';
import { PasswordField, TextField } from '../ui/Fields';
import { Notice } from '../ui/Feedback';
import { Type } from '../ui/tokens';

/*
 * The account page's three inline forms. Each opens in place under its row and closes itself on
 * success, so a change never leaves the page the learner is on.
 */

function useFormState() {
    const { l } = useI18n();
    const [fields, setFields] = useState<AccountFieldIssues>({});
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const fieldError = (field: AccountFieldName) => {
        const issue = fields[field];
        return issue ? accountFieldMessage(field, issue, l) : null;
    };

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        setFields({});
        try {
            await work();
        } catch (caught) {
            const failure = isAccountRequestError(caught) ? caught : new AccountRequestError('server_error');
            setFields(failure.fields);
            setError(accountErrorMessage(failure.code, l, failure.retryAfter));
        } finally {
            setBusy(false);
        }
    };

    return { l, fields, setFields, error, busy, fieldError, run };
}

export function EditNamePanel({ user, onDone }: { user: AccountUser; onDone: () => void }) {
    const account = useAccount();
    const form = useFormState();
    const { l } = form;
    const [name, setName] = useState(user.name);

    const save = () => {
        const issues = validateName({ name });
        if (hasIssues(issues)) {
            form.setFields(issues);
            return;
        }
        void form.run(async () => {
            await account.updateName(name);
            onDone();
        });
    };

    return (
        <PanelFrame>
            {form.error ? <Notice tone="danger">{form.error}</Notice> : null}
            <TextField
                label={l('Ad soyad', 'Full name')}
                value={name}
                onChangeText={setName}
                error={form.fieldError('name')}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="done"
                onSubmitEditing={save}
                editable={!form.busy}
                maxLength={120}
                autoFocus
            />
            <PanelActions busy={form.busy} saveLabel={l('Kaydet', 'Save')} onSave={save} onCancel={onDone} />
        </PanelFrame>
    );
}

export function ChangePasswordPanel({ user, onDone }: { user: AccountUser; onDone: (changed: boolean) => void }) {
    const account = useAccount();
    const form = useFormState();
    const { l } = form;
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const nextRef = useRef<NativeTextInput | null>(null);
    const styles = usePanelStyles();

    const save = () => {
        const issues = validatePasswordChange({ currentPassword, password }, { email: user.email, name: user.name });
        if (hasIssues(issues)) {
            form.setFields(issues);
            return;
        }
        void form.run(async () => {
            await account.changePassword({ currentPassword, password });
            onDone(true);
        });
    };

    return (
        <PanelFrame>
            {form.error ? <Notice tone="danger">{form.error}</Notice> : null}
            <PasswordField
                showLabel={l('Şifreyi göster', 'Show password')}
                hideLabel={l('Şifreyi gizle', 'Hide password')}
                label={l('Mevcut şifre', 'Current password')}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                error={form.fieldError('currentPassword')}
                returnKeyType="next"
                onSubmitEditing={() => nextRef.current?.focus()}
                editable={!form.busy}
            />
            <PasswordField
                label={l('Yeni şifre', 'New password')}
                value={password}
                onChangeText={setPassword}
                error={form.fieldError('password')}
                isNew
                hint={l(`En az ${PASSWORD_MIN_LENGTH} karakter`, `At least ${PASSWORD_MIN_LENGTH} characters`)}
                passwordRules={`minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH};`}
                showLabel={l('Şifreyi göster', 'Show password')}
                hideLabel={l('Şifreyi gizle', 'Hide password')}
                ref={nextRef}
                returnKeyType="done"
                onSubmitEditing={save}
                editable={!form.busy}
            />
            <Text style={styles.note}>
                {l(
                    'Şifreniz değişince diğer cihazlardaki oturumlarınız kapanır.',
                    'Changing your password signs you out on your other devices.',
                )}
            </Text>
            <PanelActions busy={form.busy} saveLabel={l('Yeni şifreyi kaydet', 'Save new password')} onSave={save} onCancel={() => onDone(false)} />
        </PanelFrame>
    );
}

export function DeleteAccountPanel({ user, onCancel, onDeleted }: { user: AccountUser; onCancel: () => void; onDeleted: () => void }) {
    const account = useAccount();
    const form = useFormState();
    const { l } = form;
    const [password, setPassword] = useState('');
    const styles = usePanelStyles();
    // An account made with Apple or Google has no password; the provider's sheet confirms it is
    // still its owner.
    const provider = user.hasPassword ? null : user.apple ? 'apple' : 'google';

    const remove = () => {
        if (provider) {
            void form.run(async () => {
                if (provider === 'apple') {
                    const credential = await requestAppleCredential();
                    if (!credential) return;
                    await account.deleteAccount({ appleIdentityToken: credential.identityToken });
                } else {
                    const googleIdToken = await requestGoogleIdToken();
                    if (!googleIdToken) return;
                    await account.deleteAccount({ googleIdToken });
                }
                onDeleted();
            });
            return;
        }
        if (!password) {
            form.setFields({ password: 'required' });
            return;
        }
        void form.run(async () => {
            await account.deleteAccount({ password });
            onDeleted();
        });
    };

    return (
        <PanelFrame>
            <Text style={styles.warning}>
                {l(
                    'Hesabınız sunucudan kalıcı olarak silinir; bu geri alınamaz. Kartlarınız bu cihazda kalır.',
                    'Your account is permanently deleted from the server; this can’t be undone. Your cards stay on this device.',
                )}
            </Text>
            {form.error ? <Notice tone="danger">{form.error}</Notice> : null}
            {provider ? null : (
                <PasswordField
                    showLabel={l('Şifreyi göster', 'Show password')}
                    hideLabel={l('Şifreyi gizle', 'Hide password')}
                    label={l('Onaylamak için şifrenizi yazın', 'Enter your password to confirm')}
                    value={password}
                    onChangeText={setPassword}
                    error={form.fieldError('password')}
                    returnKeyType="done"
                    onSubmitEditing={remove}
                    editable={!form.busy}
                />
            )}
            <Button
                label={provider === 'apple'
                    ? l('Apple ile onayla ve sil', 'Confirm with Apple and delete')
                    : provider === 'google'
                        ? l('Google ile onayla ve sil', 'Confirm with Google and delete')
                        : l('Hesabımı kalıcı olarak sil', 'Delete my account permanently')}
                onPress={remove}
                variant="destructive"
                busy={form.busy}
            />
            <Button variant="plain" tone="muted" label={l('Vazgeç', 'Cancel')} onPress={onCancel} disabled={form.busy} />
        </PanelFrame>
    );
}

function PanelFrame({ children }: { children: React.ReactNode }) {
    const styles = usePanelStyles();
    return <View style={styles.frame}>{children}</View>;
}

function PanelActions({ busy, saveLabel, onSave, onCancel }: { busy: boolean; saveLabel: string; onSave: () => void; onCancel: () => void }) {
    const { l } = useI18n();
    const styles = usePanelStyles();
    return (
        <View style={styles.actions}>
            <Button label={saveLabel} onPress={onSave} busy={busy} />
            <Button variant="plain" tone="muted" label={l('Vazgeç', 'Cancel')} onPress={onCancel} disabled={busy} />
        </View>
    );
}

function usePanelStyles() {
    const colors = useThemeColors();
    return {
        frame: panelStyles.frame,
        actions: panelStyles.actions,
        note: [Type.caption, { color: colors.textSecondary }],
        warning: [Type.body, { color: colors.textPrimary }],
    };
}

const panelStyles = StyleSheet.create({
    frame: { gap: Spacing.lg },
    actions: { gap: Spacing.xs },
});
