import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { clearPostDraft, usePostDraft } from '@/features/community/draft';
import { useMeetups } from '@/features/community/hooks';
import { canPickImage, pickImages, postImageUrl, uploadPostImage } from '@/features/community/images';
import type { PostInput } from '@/features/community/queries';
import type { Profile } from '@/features/community/types';
import { useGames } from '@/features/games/hooks';
import { gameImageUrl } from '@/features/games/images';
import type { Game } from '@/features/games/types';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { formatMeetupTime } from '@/lib/dates';

/**
 * 글쓰기 — 피드 맨 위에 항상 열려 있다.
 * 별도 작성 화면으로 보내면 "한 줄 남기기"의 문턱이 올라간다. 모임 기록은 가벼워야 남는다.
 *
 * 사진은 고르는 즉시 올리고 경로만 들고 있는다. 게시 버튼에서 한꺼번에 올리면
 * 사진 여러 장일 때 버튼을 누른 뒤 몇 초씩 멈춘 것처럼 보인다.
 */
export function PostComposer({
  me,
  pending,
  onSubmit,
}: {
  me: Profile;
  pending: boolean;
  onSubmit: (input: PostInput) => Promise<boolean>;
}) {
  const c = useTheme();
  const [body, setBody] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [meetup, setMeetup] = useState<{ id: string; title: string } | null>(null);
  const [picking, setPicking] = useState<'game' | 'meetup' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모임 마무리에서 보낸 초안 받기. 쓰던 글이 있으면 건드리지 않는다 —
  // 남의 문장으로 내 문장을 덮는 건 어떤 편의보다 나쁘다.
  const draft = usePostDraft();
  useEffect(() => {
    if (!draft) return;
    // 외부(모임 마무리 화면)에서 넘어온 값을 받아 적는 자리라 setState가 맞다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBody((prev) => (prev.trim() ? prev : draft.body));
    const { meetupId, meetupTitle } = draft;
    if (meetupId && meetupTitle) setMeetup((prev) => prev ?? { id: meetupId, title: meetupTitle });
    clearPostDraft();
  }, [draft]);

  const busy = pending || uploading;
  const canSubmit = !busy && (body.trim().length > 0 || paths.length > 0);

  const attach = async () => {
    setError(null);
    const files = await pickImages();
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of files) uploaded.push(await uploadPostImage(f));
      setPaths((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit({
      body,
      imagePaths: paths,
      gameId: game?.id ?? null,
      meetupId: meetup?.id ?? null,
    });
    if (ok) {
      setBody('');
      setPaths([]);
      setGame(null);
      setMeetup(null);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.row}>
        <Avatar profile={me} size={38} />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="모임에서 있었던 일을 남겨보세요"
          placeholderTextColor={c.textSecondary}
          multiline
          style={[styles.input, { color: c.text }]}
        />
      </View>

      {paths.length > 0 && (
        <View style={styles.thumbs}>
          {paths.map((p, i) => (
            <Pressable
              key={p}
              onPress={() => setPaths((prev) => prev.filter((x) => x !== p))}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}번째 사진 빼기`}>
              <Image
                source={{ uri: postImageUrl(p) ?? '' }}
                style={[styles.thumb, { backgroundColor: c.backgroundSelected }]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
              <Text style={[styles.thumbX, { color: c.text, backgroundColor: c.background }]}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      {(game || meetup) && (
        <View style={styles.tagRow}>
          {game && (
            <SelectedTag icon="dice" label={game.titleKo} color={c.accent} onClear={() => setGame(null)} />
          )}
          {meetup && (
            <SelectedTag
              icon="calendar"
              label={meetup.title}
              color={c.badgeRecommended}
              onClear={() => setMeetup(null)}
            />
          )}
        </View>
      )}

      <View style={styles.footer}>
        {canPickImage && (
          <ToolButton
            icon="image"
            label={uploading ? '올리는 중…' : '사진'}
            disabled={busy}
            onPress={() => void attach()}
          />
        )}
        <ToolButton icon="dice" label="게임" disabled={busy} onPress={() => setPicking('game')} />
        <ToolButton icon="calendar" label="일정" disabled={busy} onPress={() => setPicking('meetup')} />
        <View style={styles.spacer} />
        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: c.accent, opacity: canSubmit ? 1 : 0.4 }]}>
          <Text style={[styles.submitText, { color: c.onAccent }]}>게시</Text>
        </Pressable>
      </View>

      {error && <Text style={[styles.caption, { color: c.danger }]}>{error}</Text>}

      <PickerModal
        visible={picking !== null}
        title={picking === 'game' ? '게임 고르기' : '일정 고르기'}
        onClose={() => setPicking(null)}>
        {picking === 'game' ? (
          <GamePicker
            onPick={(g) => {
              setGame(g);
              setPicking(null);
            }}
          />
        ) : picking === 'meetup' ? (
          <MeetupPicker
            onPick={(m) => {
              setMeetup(m);
              setPicking(null);
            }}
          />
        ) : null}
      </PickerModal>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.toolButton, { opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} size={18} color={c.textSecondary} />
      <Text style={[styles.caption, { color: c.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function SelectedTag({
  icon,
  label,
  color,
  onClear,
}: {
  icon: IconName;
  label: string;
  color: string;
  onClear: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={`${label} 태그 빼기`}
      style={[styles.selectedTag, { borderColor: color, backgroundColor: c.background }]}>
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.caption, { color, flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="close" size={12} color={color} />
    </Pressable>
  );
}

function PickerModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        <Pressable
          style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={() => undefined}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: c.text }]}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.toolButton}>
              <Icon name="close" size={20} color={c.textSecondary} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 게임 고르기 — 150종이라 검색이 필수다. 목록만 주면 스크롤로 못 찾는다. */
function GamePicker({ onPick }: { onPick: (g: Game) => void }) {
  const c = useTheme();
  const t = useType();
  const { all } = useGames();
  const [q, setQ] = useState('');
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = needle
      ? all.filter(
          (g) =>
            g.titleKo.toLowerCase().includes(needle) ||
            (g.titleEn ?? '').toLowerCase().includes(needle)
        )
      : all;
    return pool.slice(0, 40);
  }, [all, q]);

  return (
    <>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="게임 이름 검색"
        placeholderTextColor={c.textSecondary}
        autoFocus
        style={[
          styles.search,
          t.body,
          { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        ]}
      />
      <ScrollView style={styles.pickList}>
        {found.map((g) => {
          const url = gameImageUrl(g);
          return (
            <Pressable
              key={g.id}
              onPress={() => onPick(g)}
              accessibilityRole="button"
              style={[styles.pickRow, { borderBottomColor: c.border }]}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={[styles.pickThumb, { backgroundColor: c.backgroundSelected }]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={[styles.pickThumb, { backgroundColor: c.backgroundSelected }]} />
              )}
              <Text style={[t.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {g.titleKo}
              </Text>
            </Pressable>
          );
        })}
        {found.length === 0 && (
          <Text style={[styles.caption, { color: c.textSecondary, padding: Spacing.three }]}>
            찾는 게임이 없어요.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

/** 일정 고르기 — 최근·예정 일정만 보여준다. 후기는 보통 방금 끝난 모임에 붙는다. */
function MeetupPicker({ onPick }: { onPick: (m: { id: string; title: string }) => void }) {
  const c = useTheme();
  const { meetups, loading } = useMeetups(true);

  return (
    <ScrollView style={styles.pickList}>
      {loading && (
        <Text style={[styles.caption, { color: c.textSecondary, padding: Spacing.three }]}>
          불러오는 중…
        </Text>
      )}
      {meetups.slice(0, 20).map((m) => (
        <Pressable
          key={m.id}
          onPress={() => onPick({ id: m.id, title: m.title })}
          accessibilityRole="button"
          style={[styles.pickRow, { borderBottomColor: c.border }]}>
          <View style={styles.pickText}>
            <Text style={[styles.body, { color: c.text }]} numberOfLines={1}>
              {m.title}
            </Text>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              {formatMeetupTime(m.startsAt)}
            </Text>
          </View>
        </Pressable>
      ))}
      {!loading && meetups.length === 0 && (
        <Text style={[styles.caption, { color: c.textSecondary, padding: Spacing.three }]}>
          만들어진 일정이 없어요. 일정 탭에서 먼저 만들어 주세요.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  input: { flex: 1, minHeight: TouchTarget.min, paddingTop: Spacing.two, ...Typography.body },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 64, height: 64, borderRadius: Radius.sm },
  thumbX: {
    position: 'absolute',
    top: 2,
    right: 2,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    ...Typography.caption,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  spacer: { flex: 1 },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  submit: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
  },
  submitText: { ...Typography.body, fontWeight: '700' },
  caption: { ...Typography.caption },
  body: { ...Typography.body },

  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: Spacing.three,
  },
  sheet: {
    width: '96%',
    maxWidth: 460,
    maxHeight: '80%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { ...Typography.subtitle, flex: 1 },
  search: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  pickList: { maxHeight: 380 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.primary,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickThumb: { width: 40, height: 40, borderRadius: Radius.sm },
  pickText: { flex: 1, gap: 1 },
});
