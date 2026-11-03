import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Banner, Button, Loading } from '@/components/ui';
import { color, font } from '@/theme';
import { clock } from '@/lib/format';
import { initials } from '@/lib/phone';
import { useOrder } from '@/hooks/data';
import { backend } from '@/backend';

const TAGS = ['Tasty', 'Hot', 'Good portion', 'Well packed', 'Fast', 'Friendly rider'];

// 15 · Rate
export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: o } = useOrder(id);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<Record<string, boolean>>({});
  const [thumb, setThumb] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!o) return <Loading />;
  const riderFirst = o.riderName?.split(' ')[0] ?? 'your rider';

  async function submit() {
    if (!stars) return setError('Tap the stars to rate the food');
    setBusy(true);
    try {
      await backend.rate(o!.id, { foodStars: stars, riderThumb: thumb, tags: TAGS.filter((t) => tags[t]), comment });
      router.replace('/customer/orders');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: color.primary, paddingTop: insets.top + 32, paddingHorizontal: 24, paddingBottom: 40, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="logo" size={36} color={color.primary} strokeWidth={3.2} />
          </View>
          <Text size={26} weight={800} tone="#FFFFFF" style={{ marginTop: 4 }} accessibilityRole="header">Enjoy your meal!</Text>
          <Text size={14} tone="rgba(255,255,255,0.92)">Order #{o.orderNo} delivered{o.deliveredAt ? ` at ${clock(o.deliveredAt)}` : ''}</Text>
        </View>

        <View style={{ paddingTop: 24, paddingHorizontal: 24, gap: 22 }}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text size={17} weight={800}>How was the food?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: stars }}>
              {[1, 2, 3, 4, 5].map((i) => {
                const on = i <= stars;
                return (
                  <Pressable key={i} onPress={() => { setStars(i); setError(null); }} accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}
                    style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: on ? color.starTint : color.canvas, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="star" size={24} color={on ? color.warning : color.disabled} fill={on ? color.star : 'none'} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <Text size={15} weight={800}>What went well?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TAGS.map((t) => {
                const on = Boolean(tags[t]);
                return (
                  <Pressable key={t} onPress={() => setTags((x) => ({ ...x, [t]: !on }))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.primaryTint : '#FFFFFF', justifyContent: 'center' }}>
                    <Text size={13} weight={700} tone={on ? color.primaryText : color.ink}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {o.riderName && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: color.canvas }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E7DCCB', alignItems: 'center', justifyContent: 'center' }}>
                <Text size={14} weight={800} tone={color.photoText}>{initials(o.riderName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text size={14} weight={700}>Rate {riderFirst}, your rider</Text>
                <Text size={12} tone={color.inkMuted}>Polite and on time?</Text>
              </View>
              <Pressable accessibilityLabel="Thumbs down" accessibilityState={{ selected: thumb === false }} onPress={() => setThumb(thumb === false ? null : false)}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: thumb === false ? color.ink : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="thumbDown" size={20} color={thumb === false ? '#FFFFFF' : color.ink} />
              </Pressable>
              <Pressable accessibilityLabel="Thumbs up" accessibilityState={{ selected: thumb === true }} onPress={() => setThumb(thumb === true ? null : true)}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: thumb === true ? color.primary : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="thumbUp" size={20} color={thumb === true ? '#FFFFFF' : color.ink} />
              </Pressable>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text size={13} weight={700} nativeID="commentLabel">Anything else?</Text>
            <TextInput
              accessibilityLabelledBy="commentLabel"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
              maxLength={500}
              placeholder="Tell Paa Jim what you loved or what to fix"
              placeholderTextColor="#9A928E"
              style={{ minHeight: 84, borderRadius: 14, borderWidth: 1.5, borderColor: color.border, paddingVertical: 12, paddingHorizontal: 14, fontFamily: font[400], fontSize: 14, color: color.ink, textAlignVertical: 'top' }}
            />
          </View>
          {error && <Banner tone="error" icon="alert">{error}</Banner>}
        </View>

        <View style={{ marginTop: 'auto', paddingTop: 20, paddingHorizontal: 24, gap: 8 }}>
          <Button title="Submit review" onPress={submit} loading={busy} />
          <Button title="Skip" variant="ghost" height={44} size={14} onPress={() => router.replace('/customer')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
