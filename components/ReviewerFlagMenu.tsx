import { useThemeColors } from '../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../lib/models';
import FlagGlyph from './FlagGlyph';
import { MenuItem, PopoverMenu } from './ui/Menu';
import { useI18n } from '../hooks/useI18n';
import { cardFlagName } from '../lib/i18n';

const FLAGS: CardFlag[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** The reviewer's flag picker: the kit's ••• menu under the toolbar, one row per flag. */
export default function ReviewerFlagMenu({
    visible,
    currentFlag,
    onClose,
    onSelect,
}: {
    visible: boolean;
    currentFlag: CardFlag;
    onClose: () => void;
    onSelect: (flag: CardFlag) => void;
}) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    return (
        <PopoverMenu
            visible={visible}
            onClose={onClose}
            accessibilityLabel={l('Bayrak rengi', 'Flag color')}
            closeLabel={l('Bayrak seçiciyi kapat', 'Close flag picker')}
        >
            {FLAGS.map((flag) => (
                <MenuItem
                    key={flag}
                    label={flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                    icon={(
                        <FlagGlyph
                            color={flag === 0 ? colors.textMuted : FLAG_COLORS[flag].color}
                            size={20}
                            filled={flag !== 0}
                        />
                    )}
                    checked={currentFlag === flag}
                    exclusive
                    // Setting a flag opens nothing, so the menu can shrink away while it applies.
                    onPress={() => { onSelect(flag); onClose(); }}
                />
            ))}
        </PopoverMenu>
    );
}
