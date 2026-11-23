import React from 'react';
import { View } from 'react-native';
import { Notice } from './ui/Feedback';
import { Button } from './ui/Button';
import { Spacing } from '../constants/theme';

export interface ReadErrorBannerProps {
    tone?: 'error' | 'info'; title: string; detail?: string;
    retryLabel?: string; onRetry?: () => void;
    secondaryLabel?: string; onSecondary?: () => void;
}
export function ReadErrorBanner({ tone = 'error', title, detail, retryLabel, onRetry, secondaryLabel, onSecondary }: ReadErrorBannerProps) {
    return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
        <Notice tone={tone === 'error' ? 'danger' : 'info'} title={title} action={
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {onRetry && retryLabel ? <Button size="compact" label={retryLabel} onPress={onRetry} /> : null}
                {onSecondary && secondaryLabel ? <Button size="compact" variant="secondary" label={secondaryLabel} onPress={onSecondary} /> : null}
            </View>
        }>{detail}</Notice>
    </View>;
}
export function SectionReadErrorCard({ title, message, retryLabel, onRetry }: {
    title: string; message: string; retryLabel?: string; onRetry?: () => void;
}) {
    return <ReadErrorBanner title={title} detail={message} retryLabel={retryLabel} onRetry={onRetry} />;
}
