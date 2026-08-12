import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useEditGame } from '@/features/games/hooks';
import type { GameInput } from '@/features/games/mappers';
import type { Game } from '@/features/games/types';
import { useSession } from '@/features/plays/hooks';
import { useTheme } from '@/hooks/use-theme';

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Props = {
  visible: boolean;
  /** null이면 새 게임 추가, 값이 있으면 그 게임 수정 */
  game: Game | null;
  /** 카테고리 선택지. 기존 목록에서 뽑아 넘긴다. */
  categoryOptions: string[];
  onClose: () => void;
  onSaved?: (game: Game) => void;
  onDeleted?: () => void;
};

function initialInput(game: Game | null): GameInput {
  return {
    titleKo: game?.titleKo ?? '',
    titleEn: game?.titleEn ?? null,
    owned: game?.owned ?? true,
    playerCounts: game?.playerCounts ?? [],
    recommendedCounts: game?.recommendedCounts ?? [],
    bestCount: game?.bestCount ?? null,
    supports10Plus: game?.supports10Plus ?? false,
    minPlaytime: game?.minPlaytime ?? null,
    maxPlaytime: game?.maxPlaytime ?? null,
    weight: game?.weight ?? null,
    categories: game?.categories ?? [],
    themes: game?.themes ?? [],
    notes: game?.notes ?? null,
    ruleVideoUrl: game?.ruleVideoUrl ?? null,
  };
}

export function GameForm({
  visible,
  game,
  categoryOptions,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { create, update, remove, pending, error } = useEditGame();
  const { activePlay } = useSession();

  // game이 바뀌면 폼을 새로 만든다. key로 리마운트시키는 쪽이 useEffect 동기화보다 단순하다.
  const [input, setInput] = useState<GameInput>(() => initialInput(game));
  const [themesText, setThemesText] = useState(() => (game?.themes ?? []).join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (next: Partial<GameInput>) => setInput((v) => ({ ...v, ...next }));

  const problems = useMemo(() => validate(input), [input]);
  const blocking = problems.filter((p) => p.blocking);

  const togglePlayer = (n: number) => {
    const has = input.playerCounts.includes(n);
    const playerCounts = has
      ? input.playerCounts.filter((v) => v !== n)
      : [...input.playerCounts, n].sort((a, b) => a - b);
    // 가능 인원에서 빠지면 추천·베스트에서도 함께 빠져야 앞뒤가 맞는다.
    patch({
      playerCounts,
      recommendedCounts: input.recommendedCounts.filter((v) => playerCounts.includes(v)),
      bestCount: input.bestCount !== null && playerCounts.includes(input.bestCount) ? input.bestCount : null,
    });
  };

  const save = async () => {
    if (blocking.length) return;
    const payload: GameInput = {
      ...input,
      themes: themesText.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const saved = game ? await update(game.id, payload) : await create(payload);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  // 게임중인 게임을 지우면 FK cascade로 진행 중 플레이가 DB에서 사라지는데
  // plays 스토어는 모른 채 남아, '게임중' 배너가 유령이 된다. 삭제 자체를 막는다.
  const deleteBlocked = game !== null && activePlay?.gameId === game.id;

  const destroy = async () => {
    if (!game || deleteBlocked) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const ok = await remove(game.id);
    if (ok !== null) {
      onDeleted?.();
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>{game ? '게임 수정' : '게임 추가'}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
          <Field label="제목" required>
            <Input value={input.titleKo} onChangeText={(titleKo) => patch({ titleKo })} placeholder="예: 아줄" />
          </Field>

          <Field label="영문 이름">
            <Input
              value={input.titleEn ?? ''}
              onChangeText={(t) => patch({ titleEn: t || null })}
              placeholder="예: Azul"
            />
          </Field>

          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: c.text }]}>지금 집에 있음</Text>
            <Switch value={input.owned} onValueChange={(owned) => patch({ owned })} />
          </View>
          {!input.owned && (
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              끄면 위시리스트로 분류되어 추천 후보에서 빠집니다.
            </Text>
          )}

          <Field label="가능 인원" required>
            <View style={styles.chipRow}>
              {PLAYER_OPTIONS.map((n) => (
                <Chip
                  key={n}
                  label={`${n}명`}
                  selected={input.playerCounts.includes(n)}
                  onPress={() => togglePlayer(n)}
                />
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={[styles.hint, { color: c.textSecondary }]}>10명 넘어도 가능</Text>
              <Switch
                value={input.supports10Plus}
                onValueChange={(supports10Plus) => patch({ supports10Plus })}
              />
            </View>
          </Field>

          {input.playerCounts.length > 0 && (
            <>
              <Field label="추천 인원">
                <View style={styles.chipRow}>
                  {input.playerCounts.map((n) => (
                    <Chip
                      key={n}
                      label={`${n}명`}
                      selected={input.recommendedCounts.includes(n)}
                      onPress={() =>
                        patch({
                          recommendedCounts: input.recommendedCounts.includes(n)
                            ? input.recommendedCounts.filter((v) => v !== n)
                            : [...input.recommendedCounts, n].sort((a, b) => a - b),
                        })
                      }
                    />
                  ))}
                </View>
              </Field>

              <Field label="베스트 인원">
                <View style={styles.chipRow}>
                  {input.playerCounts.map((n) => (
                    <Chip
                      key={n}
                      label={`${n}명`}
                      selected={input.bestCount === n}
                      onPress={() => patch({ bestCount: input.bestCount === n ? null : n })}
                    />
                  ))}
                </View>
              </Field>
            </>
          )}

          <Field label="플레이타임 (분)">
            <View style={styles.pairRow}>
              <Input
                value={input.minPlaytime?.toString() ?? ''}
                onChangeText={(t) => patch({ minPlaytime: toInt(t) })}
                placeholder="최소"
                keyboardType="number-pad"
                style={styles.half}
              />
              <Input
                value={input.maxPlaytime?.toString() ?? ''}
                onChangeText={(t) => patch({ maxPlaytime: toInt(t) })}
                placeholder="최대"
                keyboardType="number-pad"
                style={styles.half}
              />
            </View>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              한 값만 알면 두 칸에 같은 값을 넣으세요.
            </Text>
          </Field>

          <Field label="난이도 (1.0 ~ 5.0)">
            <Input
              value={input.weight?.toString() ?? ''}
              onChangeText={(t) => patch({ weight: toFloat(t) })}
              placeholder="예: 1.8"
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="카테고리">
            <View style={styles.chipRow}>
              {categoryOptions.map((v) => (
                <Chip
                  key={v}
                  label={v}
                  selected={input.categories.includes(v)}
                  onPress={() =>
                    patch({
                      categories: input.categories.includes(v)
                        ? input.categories.filter((x) => x !== v)
                        : [...input.categories, v],
                    })
                  }
                />
              ))}
            </View>
          </Field>

          <Field label="테마">
            <Input value={themesText} onChangeText={setThemesText} placeholder="쉼표로 구분 (예: 동물, 카드 게임)" />
          </Field>

          <Field label="룰 영상 (유튜브 링크)">
            <Input
              value={input.ruleVideoUrl ?? ''}
              onChangeText={(t) => patch({ ruleVideoUrl: t || null })}
              placeholder="https://youtube.com/watch?v=…"
              autoCapitalize="none"
              keyboardType="url"
            />
          </Field>

          <Field label="메모">
            <Input
              value={input.notes ?? ''}
              onChangeText={(t) => patch({ notes: t || null })}
              placeholder="규칙 요약, 확장판 보유 여부 등"
              multiline
              style={styles.multiline}
            />
          </Field>

          {problems.map((p) => (
            <Text key={p.message} style={[styles.hint, { color: p.blocking ? c.danger : c.badgeNew }]}>
              {p.blocking ? '· ' : '! '}
              {p.message}
            </Text>
          ))}
          {error && <Text style={[styles.hint, { color: c.danger }]}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three }]}>
          {game && (
            <Pressable
              onPress={destroy}
              disabled={pending || deleteBlocked}
              accessibilityRole="button"
              style={[
                styles.button,
                styles.deleteButton,
                { borderColor: deleteBlocked ? c.border : c.danger, opacity: deleteBlocked ? 0.5 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: deleteBlocked ? c.textSecondary : c.danger }]}>
                {deleteBlocked ? '게임중이라 삭제 불가' : confirmDelete ? '정말 삭제할까요?' : '삭제'}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={save}
            disabled={pending || blocking.length > 0}
            accessibilityRole="button"
            style={[
              styles.button,
              styles.saveButton,
              { backgroundColor: c.accent, opacity: pending || blocking.length ? 0.4 : 1 },
            ]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {pending ? '저장 중…' : '저장'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ── 검증 ────────────────────────────────────────────────────────────────
 * 막는 것과 알려만 주는 것을 나눈다. 인원 미입력은 실수인 경우가 많지만
 * "나중에 채우려고 일단 등록"도 정당한 사용이라 저장을 막지 않는다. */
type Problem = { message: string; blocking: boolean };

function validate(v: GameInput): Problem[] {
  const out: Problem[] = [];
  if (!v.titleKo.trim()) out.push({ message: '제목을 입력하세요.', blocking: true });
  if (v.minPlaytime !== null && v.maxPlaytime !== null && v.maxPlaytime < v.minPlaytime)
    out.push({ message: '최대 플레이타임이 최소보다 작습니다.', blocking: true });
  if (v.weight !== null && (v.weight < 1 || v.weight > 5))
    out.push({ message: '난이도는 1.0에서 5.0 사이여야 합니다.', blocking: true });
  if (v.ruleVideoUrl && !/^https?:\/\//i.test(v.ruleVideoUrl.trim()))
    out.push({ message: '룰 영상은 http(s)로 시작하는 주소여야 합니다.', blocking: true });
  if (!v.playerCounts.length)
    out.push({
      message: '가능 인원이 없으면 인원 추천에 나오지 않습니다.',
      blocking: false,
    });
  return out;
}

const toInt = (t: string) => {
  const n = parseInt(t.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const toFloat = (t: string) => {
  const n = parseFloat(t.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/* ── 조각 ────────────────────────────────────────────────────────────── */
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.textSecondary }]}>
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
    </View>
  );
}

function Input({ style, ...props }: React.ComponentProps<typeof TextInput>) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.textSecondary}
      {...props}
      style={[
        styles.input,
        { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...Typography.title, flex: 1 },
  close: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing.four, gap: Spacing.three },
  field: { gap: Spacing.two },
  label: { ...Typography.caption },
  hint: { ...Typography.caption },
  input: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  multiline: { minHeight: 96, paddingTop: Spacing.two, textAlignVertical: 'top' },
  half: { flex: 1 },
  pairRow: { flexDirection: 'row', gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
  },
  saveButton: { flex: 1 },
  deleteButton: { borderWidth: 1 },
  buttonText: { ...Typography.body, fontWeight: '600' },
});
