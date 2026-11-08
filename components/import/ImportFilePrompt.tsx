import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/** What the import screen shows before a file is chosen: the files it takes and the picker. */
export default function ImportFilePrompt({ l, onPick }: {
    l: (tr: string, en: string) => string;
    onPick: () => void;
}) {
    return (
        <Card padded title={l('İçe aktarılacak dosyayı seçin', 'Choose a file to import')} description=".apkg · .colpkg · .csv · .tsv · .txt">
            <Button label={l('Dosya seç', 'Choose File')} onPress={onPick} accessibilityLabel={l('Dosya seç', 'Choose file')} />
        </Card>
    );
}
