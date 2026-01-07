import { View, Text, Button } from "react-native";
import { router } from "expo-router";

export default function LoginScreen() {
  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 24, marginBottom: 20 }}>
        Login Screen
      </Text>

      <Button
        title="Go to Dashboard"
        onPress={() => router.push("/dashboard")}
      />
    </View>
  );
}
