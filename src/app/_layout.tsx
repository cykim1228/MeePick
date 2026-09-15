import { Jua_400Regular, useFonts } from '@expo-google-fonts/jua';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Onboarding } from '@/components/onboarding';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 제목용 폰트(Jua). 로드 전에 그리면 네이티브에서 미로드 폰트 에러가 나므로
  // 스플래시(preventAutoHideAsync로 떠 있음)를 유지한 채 기다린다.
  const [fontsLoaded] = useFonts({ Jua_400Regular });
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
      {/* 첫 안내는 어느 탭에 있든 떠야 한다 — 가입 직후 어느 화면에 떨어질지는 그때그때 다르다. */}
      <Onboarding />
    </ThemeProvider>
  );
}
