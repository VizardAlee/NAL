import { Text, View } from "react-native";
import { auth } from "../../lib/firebase";

export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Firebase connected ✅</Text>
      <Text>User: {auth.currentUser ? auth.currentUser.email : "Not logged in"}</Text>
    </View>
  );
}
