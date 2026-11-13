import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { localDateToYmd, ymdToLocalDate } from '../../lib/studyPlans';
import { ValueRow } from '../ui/Rows';

/**
 * A date row of the study tools' forms (analysis, planning, clearing): its label and the system's
 * compact date picker, in the accent colour. The rest of those screens is drawn by the shared parts
 * in `components/ui`.
 */
export function DateField({ label, ymd, onChange, minimumYmd }: {
    label: string;
    ymd: string;
    onChange: (ymd: string) => void;
    minimumYmd?: string;
}) {
    const { localeTag } = useI18n();
    const colors = useThemeColors();
    return (
        <ValueRow label={label}>
            <DateTimePicker
                value={ymdToLocalDate(ymd)}
                mode="date"
                display="compact"
                locale={localeTag}
                accentColor={colors.accent}
                minimumDate={minimumYmd ? ymdToLocalDate(minimumYmd) : undefined}
                onChange={(_event, value) => { if (value) onChange(localDateToYmd(value)); }}
            />
        </ValueRow>
    );
}
