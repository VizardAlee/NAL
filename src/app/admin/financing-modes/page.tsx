
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

const financingModes = [
    {
        name: "Murabaha (Cost-Plus)",
        description: "This is a contract where the financier purchases an asset on behalf of a client and then sells it back to the client at a pre-agreed higher price. The client typically pays this amount in installments. This is the most common mode used in the platform and aligns with the standard 'deal' structure.",
        application: "Used for asset financing, where a client needs to acquire goods, equipment, or property. The 'principal' represents the cost of the asset, and the 'profit rate' represents the markup."
    },
    {
        name: "Ijara (Leasing)",
        description: "An arrangement where the financier buys an asset and leases it to a client for a specific period and for an agreed-upon rental fee. Ownership of the asset remains with the financier. A variation, 'Ijara wa Iqtina', is a lease that concludes with the client purchasing the asset.",
        application: "Ideal for financing assets that have a long-term use, such as vehicles, machinery, or buildings, without requiring the client to purchase it upfront."
    }
]

export default function FinancingModesPage() {
    return (
        <div>
            <PageHeader
                title="Islamic Financing Modes"
                description="An overview of the financing structures used on the platform."
                icon={BookOpen}
            />
            <div className="grid gap-6 md:grid-cols-2">
                {financingModes.map((mode) => (
                    <Card key={mode.name}>
                        <CardHeader>
                            <CardTitle>{mode.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-muted-foreground">{mode.description}</p>
                            <div>
                                <h4 className="font-semibold mb-1">Common Application:</h4>
                                <p className="text-sm text-muted-foreground">{mode.application}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
