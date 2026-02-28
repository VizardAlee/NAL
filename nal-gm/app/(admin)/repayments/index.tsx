import { View, Text, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";

export default function AdminDashboard() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Header */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: "#0F172A" }}>
          Admin Dashboard
        </Text>
        <Text style={{ marginTop: 4, color: "#64748B" }}>
          Platform overview and controls
        </Text>
      </View>

      {/* Stats */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard title="Total Users" value="—" />
        <StatCard title="Active Deals" value="—" />
        <StatCard title="Total Investments" value="—" />
        <StatCard title="Platform Revenue" value="—" />
      </View>

      {/* Actions */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: "#0F172A",
            marginBottom: 12,
          }}
        >
          Admin Actions
        </Text>

        <ActionButton
          label="Approve Deal Requests"
          onPress={() => router.push("/admin/deal-requests")}
        />
        <ActionButton
          label="Approve Deposit Requests"
          onPress={() => router.push("/admin/deposit-requests")}
        />
        <ActionButton
          label="Manage Users"
          onPress={() => router.push("/admin/users")}
        />
        <ActionButton
          label="View All Deals"
          onPress={() => router.push("/admin/deals")}
        />
      </View>

      {/* Placeholder Section */}
      <View
        style={{
          padding: 16,
          borderRadius: 12,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E5E7EB",
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 4 }}>
          System Status
        </Text>
        <Text style={{ color: "#64748B" }}>
          All services operational. No pending alerts.
        </Text>
      </View>
    </ScrollView>
  );
}

/* ---------------- Components ---------------- */

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <View
      style={{
        flexBasis: "48%",
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <Text style={{ color: "#64748B", fontSize: 12 }}>{title}</Text>
      <Text style={{ fontSize: 20, fontWeight: "700", marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 16,
        borderRadius: 10,
        backgroundColor: "#14532D",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
