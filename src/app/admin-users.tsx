import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { AdminGate, AdminHeader } from '@/components/admin-gate';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useOpenProfile } from '@/features/community/navigation';
import { fetchMembers, removeMemberProfile, setAdmin } from '@/features/community/queries';
import type { Profile } from '@/features/community/types';
import { fetchGuestMembers, linkGuestToProfile } from '@/features/plays/queries';
import type { Member } from '@/features/plays/types';
import { useConfirmOnce } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 사용자 관리 — 모임장 전용.
 *
 * '내보내기'는 계정 삭제가 아니라 회원 자격 해제다. 그 사람의 글·댓글은 함께 사라지지만
 * 플레이 기록의 멤버 행은 남는다 — 지난 게임의 승패는 사람이 나가도 남아 있어야
 * 통계가 성립한다. 계정은 살아 있어 참여 코드를 다시 넣으면 돌아올 수 있다.
 */
export default function AdminUsersScreen() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const { profile } = useMyProfile();
  const openProfile = useOpenProfile();

  const [members, setMembers] = useState<Profile[]>([]);
  const [guests, setGuests] = useState<Member[]>([]);
  const [linking, setLinking] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // 확인 상태는 다른 곳을 건드리면 풀린다 — 내보내기는 되돌리기 번거로운 동작이라 특히 중요하다.
  const confirm = useConfirmOnce<string>();

  const reload = useCallback(async () => {
    try {
      const [profiles, guestList] = await Promise.all([fetchMembers(), fetchGuestMembers()]);
      setMembers(profiles);
      setGuests(guestList);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminGate>
      <View
        {...confirm.bind}
        style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <AdminHeader title="사용자 관리" subtitle={`회원 ${members.length}명`} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
          {error && <Text style={[t.caption, { color: c.danger }]}>{error}</Text>}

          {members.map((m) => {
            const me = m.id === profile?.id;
            return (
              <View
                key={m.id}
                style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {/* 사진·이름을 누르면 그 회원 프로필 — 내보내기 전에 누구인지 확인할 수 있게. */}
                <Pressable
                  onPress={() => openProfile(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.displayName} 프로필`}
                  style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
                  <Avatar profile={m} size={40} />
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <Text style={[t.body, styles.name, { color: c.text }]} numberOfLines={1}>
                        {m.displayName}
                      </Text>
                      {m.isAdmin && (
                        <View style={[styles.badge, { borderColor: c.accent }]}>
                          <Text style={[t.caption, styles.badgeText, { color: c.accent }]}>모임장</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
                      @{m.handle}
                      {m.realName ? ` · ${m.realName}` : ''}
                    </Text>
                  </View>
                </Pressable>

                {!me && (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void run(() => setAdmin(m.id, !m.isAdmin))}
                      disabled={pending}
                      accessibilityRole="button"
                      style={[styles.smallButton, { borderColor: c.border }]}>
                      <Text style={[t.caption, { color: c.text }]}>
                        {m.isAdmin ? '해제' : '모임장'}
                      </Text>
                    </Pressable>
                    {/* 손님 기록 잇기 — 이을 손님이 남아 있을 때만 낸다. */}
                    {guests.length > 0 && (
                      <Pressable
                        onPress={() => setLinking(m)}
                        disabled={pending}
                        accessibilityRole="button"
                        style={[styles.smallButton, { borderColor: c.border }]}>
                        <Text style={[t.caption, { color: c.text }]}>기록 잇기</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() =>
                        confirm.press(m.id, () => void run(() => removeMemberProfile(m.id)))
                      }
                      disabled={pending}
                      accessibilityRole="button"
                      style={[styles.smallButton, { borderColor: c.danger }]}>
                      <Text style={[t.caption, { color: c.danger }]}>
                        {confirm.pendingId === m.id ? '정말?' : '내보내기'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          {guests.length > 0 && (
            <View style={[styles.note, { borderColor: c.border }]}>
              <Icon name="user" size={16} color={c.textSecondary} />
              <Text style={[t.caption, styles.noteText, { color: c.textSecondary }]}>
                계정 없이 기록만 있는 사람: {guests.map((g) => g.name).join(', ')}. 그 사람이
                가입했다면 &lsquo;기록 잇기&rsquo;로 이어 주세요 — 안 이으면 같은 사람의 전적이
                둘로 갈라집니다.
              </Text>
            </View>
          )}

          <View style={[styles.note, { borderColor: c.border }]}>
            <Icon name="user" size={16} color={c.textSecondary} />
            <Text style={[t.caption, styles.noteText, { color: c.textSecondary }]}>
              내보내면 그 회원의 글·댓글이 함께 사라집니다. 플레이 기록(승패·점수)은 남습니다.
              계정은 지워지지 않아 참여 코드를 다시 넣으면 돌아올 수 있어요.
            </Text>
          </View>
        </ScrollView>
        <LinkGuestModal
          target={linking}
          guests={guests}
          pending={pending}
          onClose={() => setLinking(null)}
          onPick={async (guest) => {
            if (!linking) return;
            await run(async () => {
              await linkGuestToProfile(guest.id, linking.id);
            });
            setLinking(null);
          }}
        />
      </View>
    </AdminGate>
  );
}

/**
 * 손님 고르기.
 *
 * 이 동작은 되돌리기가 번거롭다(손님 행이 계정에 묶이고 빈 행이 지워진다).
 * 그래서 목록에 판 수를 함께 보여 준다 — 이름만으로는 동명이인을 가려낼 수 없고,
 * "3판 한 김나영"이라는 정보가 있어야 사람이 맞는지 판단할 수 있다.
 */
function LinkGuestModal({
  target,
  guests,
  pending,
  onClose,
  onPick,
}: {
  target: Profile | null;
  guests: Member[];
  pending: boolean;
  onClose: () => void;
  onPick: (guest: Member) => void;
}) {
  const c = useTheme();
  const t = useType();

  return (
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        <Pressable
          style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={() => undefined}>
          <Text style={[t.body, styles.sheetTitle, { color: c.text }]}>
            {target?.displayName}님과 같은 사람인 손님은?
          </Text>
          <Text style={[t.caption, { color: c.textSecondary }]}>
            고르면 그 손님의 지난 기록이 이 계정의 것이 됩니다. 되돌리려면 손으로 다시 나눠야 해요.
          </Text>
          <ScrollView style={styles.pickList}>
            {guests.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => onPick(g)}
                disabled={pending}
                accessibilityRole="button"
                style={[styles.pickRow, { borderBottomColor: c.border }]}>
                <Text style={[t.body, { color: c.text }]}>{g.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
            <Text style={[t.body, { color: c.textSecondary }]}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontWeight: '700', flexShrink: 1 },
  badge: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  badgeText: { fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.one },
  smallButton: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: Spacing.three,
  },
  sheet: {
    width: '96%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sheetTitle: { fontWeight: '700' },
  pickList: { maxHeight: 300 },
  pickRow: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
});
