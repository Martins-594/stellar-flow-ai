import "jsr:@supabase/functions-js/edge-runtime.dts";
import { corsHeaders, requireAuth, isAuthResult } from "../_shared/auth.ts";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (!isAuthResult(auth)) {
      return auth;
    }

    const { publicKey } = await req.json();

    if (!publicKey) {
      return new Response(
        JSON.stringify({ success: false, error: "publicKey is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch account from Horizon
    const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);

    if (!res.ok) {
      if (res.status === 404) {
        return new Response(
          JSON.stringify({
            success: true,
            funded: false,
            balances: [{ asset_type: "native", balance: "0" }],
            xlmBalance: "0",
            usdValue: "$0.00",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw new Error(`Horizon API error [${res.status}]: ${await res.text()}`);
    }

    const account = await res.json();
    const balances = account.balances || [];

    const xlmBalance =
      balances.find((b: any) => b.asset_type === "native")?.balance || "0";
    const xlmNum = parseFloat(xlmBalance);
    // Mock XLM price ~$0.50
    const usdValue = `$${(xlmNum * 0.5).toFixed(2)}`;

    return new Response(
      JSON.stringify({
        success: true,
        funded: true,
        balances,
        xlmBalance: xlmNum.toFixed(2),
        usdValue,
        sequence: account.sequence,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
