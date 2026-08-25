import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useSession } from '@/features/plays/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

type Props = {
  /** 이미 선택돼 있던 멤버 (변경 모드) */
  initialIds: string[];
  confirmLabel?: string;
  onConfirm: (ids: string[]) => void;
  /** 게이트 모드에서만: 멤버 없이 그냥 둘러보기 */
  onSkip?: () => void;
  /** 변경 모드에서만: 닫기 */
  onClose?: () => void;
};

/**
 * 오늘의 멤버 선택. 게임 목록 앞의 게이트로도, 세션 중간의 '변경' 모달로도 쓰인다.
 * 여기서 확정된 인원수가 추천 화면의 인원 필터 기본값이 된다.
 */
export function SessionSetup({ initialIds, confirmLabel = '시작하기', onConfirm, onSkip, onClose }: Props) {
  const c = useTheme();
  const t = useType();
  const { members, addMember, removeMember, renameMember, pending, actionError } = useSession();

  const [selected, setSelected] = useState<string[]>(initialIds);
  const [newName, setNewName] = useState('');
  const [managing, setManaging] = useState(false);
  /** 관리 모드에서 편집 중인 멤버. name은 입력 초안이다. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  /**
   * 가입한 사람은 목록에 저절로 올라온다(가입 시 멤버 행이 함께 생긴다).
   * 손님은 로그인 없이 한 판 낀 사람이라 여기서 이름만 적어 추가한다.
   */
  const { joined, guests } = useMemo(
    () => ({
      joined: members.filter((m) => m.profileId !== null),
      guests: members.filter((m) => m.profileId === null),
    }),
    [members]
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submitName = async () => {
    const name = newName.trim();
    if (!name) return;
    const member = await addMember(name);
    if (member) {
      setNewName('');
      // 방금 등록한 사람은 오늘 함께할 사람일 가능성이 높다.
      setSelected((prev) => [...prev, member.id]);
    }
  };

  const submitRename = async () => {
    if (!editing || !editing.name.trim()) return;
    const updated = await renameMember(editing.id, editing.name);
    if (updated) setEditing(null);
  };

  const submitDelete = async () => {
    if (!editing) return;
    const ok = await removeMember(editing.id);
    if (ok) {
      setSelected((prev) => prev.filter((x) => x !== editing.id));
      setEditing(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.h1, t.display, { color: c.text }]}>오늘 누구랑 하나요?</Text>
          {onClose && (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
              <Text style={[styles.h1, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          )}
        </View>
        <Text style={[styles.sub, { color: c.textSecondary }]}>
          멤버를 고르면 그 인원수에 맞는 게임을 추천해 드려요.
        </Text>

        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={() => void submitName()}
            placeholder="손님 이름 (가입 안 한 사람)"
            placeholderTextColor={c.textSecondary}
            style={[
              styles.input,
              { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
            ]}
          />
          <Pressable
            onPress={() => void submitName()}
            disabled={pending || !newName.trim()}
            accessibilityRole="button"
            style={[styles.addButton, { backgroundColor: c.accent, opacity: pending || !newName.trim() ? 0.4 : 1 }]}>
            <Text style={[styles.addButtonText, { color: c.onAccent }]}>추가</Text>
          </Pressable>
        </View>

        {joined.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>회원</Text>
            <View style={styles.chipRow}>
              {joined.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={selected.includes(m.id)}
                  // 회원 이름은 프로필의 닉네임을 따라간다. 여기서 고치면 두 곳이 갈라진다.
                  onPress={() => toggle(m.id)}
                />
              ))}
            </View>
          </>
        )}

        {guests.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>손님</Text>
            <View style={styles.chipRow}>
              {guests.map((m) => (
                <Chip
                  key={m.id}
                  label={managing ? `✎ ${m.name}` : m.name}
                  selected={managing ? editing?.id === m.id : selected.includes(m.id)}
                  onPress={() => {
                    if (managing) {
                      setEditing({ id: m.id, name: m.name });
                    } else {
                      toggle(m.id);
                    }
                  }}
                />
              ))}
            </View>
          </>
        )}

        {managing && editing && (
          // key로 멤버 전환 시 입력을 리마운트해 초안·포커스가 이전 멤버 것을 물려받지 않게 한다.
          <View key={editing.id} style={styles.editBox}>
            <View style={styles.addRow}>
              <TextInput
                value={editing.name}
                onChangeText={(name) => setEditing((e) => (e ? { ...e, name } : e))}
                onSubmitEditing={() => void submitRename()}
                autoFocus
                placeholder="새 이름"
                placeholderTextColor={c.textSecondary}
                style={[
                  styles.input,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
              <Pressable
                onPress={() => void submitRename()}
                disabled={pending || !editing.name.trim()}
                accessibilityRole="button"
                style={[
                  styles.addButton,
                  { backgroundColor: c.accent, opacity: pending || !editing.name.trim() ? 0.4 : 1 },
                ]}>
                <Text style={[styles.addButtonText, { color: c.onAccent }]}>저장</Text>
              </Pressable>
            </View>
            <View style={styles.editActions}>
              <Pressable
                onPress={() => void submitDelete()}
                disabled={pending}
                accessibilityRole="button"
                style={styles.editAction}>
                <Text style={[styles.hint, { color: c.danger }]}>이 멤버 삭제하기</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(null)} accessibilityRole="button" style={styles.editAction}>
                <Text style={[styles.hint, { color: c.textSecondary }]}>취소</Text>
              </Pressable>
            </View>
          </View>
        )}

        {members.length === 0 && (
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            아직 멤버가 없어요. 가입하면 자동으로 올라오고, 손님은 위에서 이름을 적어 추가하세요.
          </Text>
        )}

        {guests.length > 0 && (
          <Pressable
            onPress={() => {
              setManaging((v) => !v);
              setEditing(null);
            }}
            accessibilityRole="button"
            style={styles.manageToggle}>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              {managing ? '관리 끝내기' : '손님 이름 바꾸기·삭제'}
            </Text>
          </Pressable>
        )}

        {actionError && <Text style={[styles.hint, { color: c.danger }]}>{actionError}</Text>}

        <Text style={[styles.count, { color: c.text }]}>
          {selected.length > 0 ? `${selected.length}명이서 합니다` : '멤버를 골라주세요'}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => onConfirm(selected)}
          disabled={selected.length === 0}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: c.accent, opacity: selected.length === 0 ? 0.4 : 1 }]}>
          <Text style={[styles.confirmText, { color: c.onAccent }]}>
            {selected.length > 0 ? `${selected.length}명으로 ${confirmLabel}` : confirmLabel}
          </Text>
        </Pressable>
        {onSkip && (
          <Pressable onPress={onSkip} accessibilityRole="button" style={styles.skip}>
            <Text style={[styles.hint, { color: c.textSecondary }]}>멤버 없이 둘러볼게요</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.five, gap: Spacing.three, maxWidth: 720, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  h1: { ...Typography.display, flex: 1 },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  sub: { ...Typography.body },
  addRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  input: {
    flex: 1,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  addButton: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
  addButtonText: { ...Typography.body, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  editBox: { gap: Spacing.one },
  editActions: { flexDirection: 'row', gap: Spacing.four },
  editAction: { minHeight: TouchTarget.min, justifyContent: 'center' },
  manageToggle: { alignSelf: 'flex-start', minHeight: TouchTarget.min, justifyContent: 'center' },
  sectionLabel: { ...Typography.label, marginTop: Spacing.two },
  hint: { ...Typography.caption },
  count: { ...Typography.subtitle, marginTop: Spacing.two },
  footer: {
    padding: Spacing.five,
    paddingTop: 0,
    gap: Spacing.two,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  confirm: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  confirmText: { ...Typography.body, fontWeight: '700' },
  skip: { alignItems: 'center', minHeight: TouchTarget.min, justifyContent: 'center' },
});
