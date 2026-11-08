import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Text } from '../AppText';
import {
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
import { AuthTextField, PasswordField } from './AuthFields';
import { AuthButton, AuthNotice, TextLink } from './AuthControls';
import { useAccountPalette } from './accountPalette';

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
            {form.error ? <AuthNotice tone="error" text={form.error} /> : null}
            <AuthTextField
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
            {form.error ? <AuthNotice tone="error" text={form.error} /> : null}
            <PasswordField
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
                strengthContext={{ email: user.email, name: user.name }}
                placeholder={l('Yeni bir şifre belirleyin', 'Choose a new password')}
                inputRef={nextRef}
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

export function DeleteAccountPanel({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
    const account = useAccount();
    const form = useFormState();
    const { l } = form;
    const [password, setPassword] = useState('');
    const styles = usePanelStyles();

    const remove = () => {
        if (!password) {
            form.setFields({ password: 'required' });
            return;
        }
        void form.run(async () => {
            await account.deleteAccount(password);
            onDeleted();
        });
    };

    return (
        <PanelFrame>
            <Text style={styles.warning}>
                {l(
                    'Hesabınız, adınız, e-postanız ve hesap etkinliğiniz sunucudan kalıcı olarak silinir. Bu işlem geri alınamaz. Kartlarınız, desteleriniz ve çalışma geçmişiniz bu cihazda kalır.',
                    'Your account, name, email and account activity are permanently deleted from the server. This cannot be undone. Your cards, decks and study history stay on this device.',
                )}
            </Text>
            {form.error ? <AuthNotice tone="error" text={form.error} /> : null}
            <PasswordField
                label={l('Onaylamak için şifrenizi yazın', 'Enter your password to confirm')}
                value={password}
                onChangeText={setPassword}
                error={form.fieldError('password')}
                returnKeyType="done"
                onSubmitEditing={remove}
                editable={!form.busy}
            />
            <AuthButton
                label={l('Hesabımı kalıcı olarak sil', 'Delete my account permanently')}
                onPress={remove}
                variant="danger"
                busy={form.busy}
            />
            <TextLink label={l('Vazgeç', 'Cancel')} onPress={onCancel} disabled={form.busy} tone="muted" />
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
            <AuthButton label={saveLabel} onPress={onSave} busy={busy} />
            <TextLink label={l('Vazgeç', 'Cancel')} onPress={onCancel} disabled={busy} tone="muted" />
        </View>
    );
}

function usePanelStyles() {
    const palette = useAccountPalette();
    return useMemo(() => StyleSheet.create({
        frame: { gap: 16, paddingTop: 4, paddingBottom: 8 },
        actions: { gap: 4 },
        note: { fontSize: 13, lineHeight: 18, color: palette.inkSecondary },
        warning: { fontSize: 14, lineHeight: 21, color: palette.ink },
    }), [palette]);
}
