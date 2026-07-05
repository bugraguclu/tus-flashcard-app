import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { useApp } from './(tabs)/app-context';
import { getAllNoteTypes, getNoteType, saveNoteType } from '../lib/noteManager';
import { uniqueId, BUILTIN_NOTE_TYPES } from '../lib/models';

export default function NoteTypesScreen() {
    const router = useRouter();
    const { dataVersion, bumpDataVersion } = useApp();
    const noteTypes = useMemo(() => getAllNoteTypes(), [dataVersion]);

    const createNoteType = () => {
        const base = getNoteType(4) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === 4)!;
        const id = uniqueId();
        saveNoteType({ ...base, id, name: 'Yeni Not Türü', mod: Math.floor(Date.now() / 1000) });
        bumpDataVersion();
        router.push(`/note-type?id=${id}`);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.help}>Not türlerini, alanlarını ve kart şablonlarını düzenleyin.</Text>

                {noteTypes.map((nt) => (
                    <TouchableOpacity
                        key={nt.id}
                        style={styles.row}
                        onPress={() => router.push(`/note-type?id=${nt.id}`)}
                    >
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle}>{nt.name}</Text>
                            <Text style={styles.rowSub}>
                                {nt.fields.length} alan · {nt.templates.length} şablon ·{' '}
                                {nt.kind === 'cloze' ? 'boşluk doldurma' : 'standart'}
                            </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.addBtn} onPress={createNoteType}>
                    <Text style={styles.addBtnText}>+ Yeni Not Türü</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    content: { padding: Spacing.lg, gap: Spacing.sm },
    help: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
    },
    rowText: { flex: 1 },
    rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    rowSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
    chevron: { fontSize: 24, color: Colors.textMuted },
    addBtn: {
        borderWidth: 1,
        borderColor: Colors.accent,
        borderRadius: BorderRadius.sm,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    addBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accent },
});
