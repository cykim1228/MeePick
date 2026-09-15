import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { CollapsibleFilterSection } from '@/components/filter-section';
import { SheetModal } from '@/components/sheet-modal';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { canPickImage, pickImages, uploadPostImage } from '@/features/community/images';
import { useEditGame } from '@/features/games/hooks';
import { storageImageUrl } from '@/features/games/images';
import type { GameInput } from '@/features/games/mappers';
import type { Game } from '@/features/games/types';
import { useSession } from '@/features/plays/hooks';
import { useConfirmOnce } from '@/hooks/use-confirm-once';
import { useTouch } from '@/hooks/use-touch';
import { useTheme } from '@/hooks/use-theme';

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Props = {
  visible: boolean;
  /** null이면 새 게임 추가, 값이 있으면 그 게임 수정 */
  game: Game | null;
  /** 카테고리·테마·메커니즘 선택지. 기존 목록에서 뽑아 넘긴다 — 새 이름이 마구 생기면
      필터가 1건짜리 값으로 뒤덮인다. */
  categoryOptions: string[];
  themeOptions: string[];
  mechanicOptions: string[];
  /** 새 게임의 '지금 집에 있음' 초기값. 위시리스트에서 추가할 때 false로 넘긴다. */
  defaultOwned?: boolean;
  /**
   * 위시리스트 전용 모드 — 일반 회원이 "사고 싶은 게임"을 올릴 때.
   *
   * '지금 집에 있음' 스위치를 감춘다. 정책이 owned=false만 허용하므로 켜 봐야 저장에서
   * 막히는데, 막힌 뒤에야 알게 되는 것보다 아예 안 보이는 편이 낫다.
   * 소장으로 옮기는 판단은 실제로 샀는지 아는 모임장이 한다.
   */
  wishOnly?: boolean;
  onClose: () => void;
  onSaved?: (game: Game) => void;
  onDeleted?: () => void;
};

function initialInput(game: Game | null, defaultOwned: boolean): GameInput {
  return {
    titleKo: game?.titleKo ?? '',
    titleEn: game?.titleEn ?? null,
    owned: game?.owned ?? defaultOwned,
    playerCounts: game?.playerCounts ?? [],
    recommendedCounts: game?.recommendedCounts ?? [],
    bestCount: game?.bestCount ?? null,
    supports10Plus: game?.supports10Plus ?? false,
    minPlaytime: game?.minPlaytime ?? null,
    maxPlaytime: game?.maxPlaytime ?? null,
    weight: game?.weight ?? null,
    categories: game?.categories ?? [],
    themes: game?.themes ?? [],
    mechanics: game?.mechanics ?? [],
    imagePath: game?.imagePath ?? null,
    notes: game?.notes ?? null,
    ruleVideoUrl: game?.ruleVideoUrl ?? null,
  };
}

export function GameForm({
  visible,
  game,
  categoryOptions,
  themeOptions,
  mechanicOptions,
  defaultOwned = true,
  wishOnly = false,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const c = useTheme();
  const touch = useTouch();
  const { create, update, remove, pending, error } = useEditGame();
  const { activePlay } = useSession();

  // game이 바뀌면 폼을 새로 만든다. key로 리마운트시키는 쪽이 useEffect 동기화보다 단순하다.
  const [input, setInput] = useState<GameInput>(() => initialInput(game, defaultOwned));
  const [themesOpen, setThemesOpen] = useState(false);
  const [mechanicsOpen, setMechanicsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const toggleTag = (key: 'themes' | 'mechanics', value: string) =>
    patch({
      [key]: input[key].includes(value)
        ? input[key].filter((v) => v !== value)
        : [...input[key], value],
    });

  /** 표지 한 장. 사진과 같은 통로(NAS)로 올리고 경로만 저장한다. */
  const pickCover = async () => {
    setImageError(null);
    const [file] = await pickImages(false);
    if (!file) return;
    setUploading(true);
    try {
      patch({ imagePath: await uploadPostImage(file) });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };
  // 삭제 확인은 폼 안 다른 곳을 건드리면 풀린다.
  const delConfirm = useConfirmOnce<'del'>();

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
    const saved = game ? await update(game.id, input) : await create(input);
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  };

  // 게임중인 게임을 지우면 FK cascade로 진행 중 플레이가 DB에서 사라지는데
  // plays 스토어는 모른 채 남아, '게임중' 배너가 유령이 된다. 삭제 자체를 막는다.
  const deleteBlocked = game !== null && activePlay?.gameId === game.id;

  const destroy = () => {
    if (!game || deleteBlocked) return;
    delConfirm.press('del', async () => {
      const ok = await remove(game.id);
      if (ok !== null) {
        onDeleted?.();
        onClose();
      }
    });
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View {...delConfirm.bind} style={styles.content}>
        {/* 표지 — 없으면 회색 자리만 있고, 누르면 한 장 고른다. */}
        {canPickImage && (
          <Pressable
            onPress={() => void pickCover()}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="대표 이미지 고르기"
            style={[styles.coverPick, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
            {input.imagePath ? (
              <Image
                source={{ uri: storageImageUrl(input.imagePath) ?? undefined }}
                style={styles.coverImage}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.coverEmpty}>
                <Icon name="image" size={22} color={c.textSecondary} />
              </View>
            )}
            <Text style={[styles.hint, styles.coverLabel, { color: c.textSecondary }]}>
              {uploading ? '올리는 중…' : input.imagePath ? '대표 이미지 바꾸기' : '대표 이미지 올리기'}
            </Text>
          </Pressable>
        )}
        {imageError && <Text style={[styles.hint, { color: c.danger }]}>{imageError}</Text>}

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

          {wishOnly ? (
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              위시리스트에 올라갑니다. 실제로 사면 모임장이 소장 목록으로 옮겨 줍니다.
            </Text>
          ) : (
            <>
              <View style={styles.switchRow}>
                <Text style={[styles.label, { color: c.text }]}>지금 집에 있음</Text>
                <Switch value={input.owned} onValueChange={(owned) => patch({ owned })} />
              </View>
              {!input.owned && (
                <Text style={[styles.hint, { color: c.textSecondary }]}>
                  끄면 위시리스트로 분류되어 추천 후보에서 빠집니다.
                </Text>
              )}
            </>
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

          {/* 테마·메커니즘은 기존 값에서 고른다. 자유 입력이면 '동물'과 '동물들'이 따로 생겨
              필터가 1건짜리 값으로 지저분해진다. 옵션이 많아 기본은 접어 둔다. */}
          <CollapsibleFilterSection
            label="테마"
            selectedCount={input.themes.length}
            expanded={themesOpen}
            onToggle={() => setThemesOpen((v) => !v)}>
            <View style={styles.chipRow}>
              {themeOptions.map((v) => (
                <Chip
                  key={v}
                  label={v}
                  selected={input.themes.includes(v)}
                  onPress={() => toggleTag('themes', v)}
                />
              ))}
            </View>
          </CollapsibleFilterSection>

          <CollapsibleFilterSection
            label="메커니즘"
            selectedCount={input.mechanics.length}
            expanded={mechanicsOpen}
            onToggle={() => setMechanicsOpen((v) => !v)}>
            <View style={styles.chipRow}>
              {mechanicOptions.map((v) => (
                <Chip
                  key={v}
                  label={v}
                  selected={input.mechanics.includes(v)}
                  onPress={() => toggleTag('mechanics', v)}
                />
              ))}
            </View>
          </CollapsibleFilterSection>

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

        <View style={[styles.footer, { borderTopColor: c.border }]}>
          {game && (
            <Pressable
              onPress={destroy}
              disabled={pending || deleteBlocked}
              accessibilityRole="button"
              style={[
                styles.button,
                styles.deleteButton,
                {
                  minHeight: touch.primary,
                  borderColor: deleteBlocked ? c.border : c.danger,
                  opacity: deleteBlocked ? 0.5 : 1,
                },
              ]}>
              <Text style={[styles.buttonText, { color: deleteBlocked ? c.textSecondary : c.danger }]}>
                {deleteBlocked ? '게임중이라 삭제 불가' : delConfirm.pendingId ? '정말 삭제할까요?' : '삭제'}
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
              {
                minHeight: touch.primary,
                backgroundColor: c.accent,
                opacity: pending || blocking.length ? 0.4 : 1,
              },
            ]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {pending ? '저장 중…' : '저장'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SheetModal>
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
  coverPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: { width: 64, height: 64, borderRadius: Radius.sm },
  coverEmpty: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  coverLabel: { flex: 1 },
  content: { padding: Spacing.two, gap: Spacing.three },
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
  // minWidth: 0 이 없으면 입력칸이 내용 너비 아래로 줄지 않아 오른쪽 칸이 잘려 나간다.
  half: { flex: 1, minWidth: 0 },
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
  saveButton: { flex: 1, minWidth: 0 },
  deleteButton: { borderWidth: 1 },
  buttonText: { ...Typography.body, fontWeight: '600' },
});
