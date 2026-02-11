import type { ActionFunctionArgs } from "@react-router/node";
import { PrismaClient } from "@prisma/client";
import { CustomerJourneyService } from "../../services/journey";

const prisma = new PrismaClient();

/**
 * API endpoint to retrieve customer journey and funnel data
 * GET /api/customer-journey?customerHash=xxx&shop=xxx
 * GET /api/customer-journey/status?shop=xxx&status=converted|abandoned|refunded&limit=100
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const customerHash = url.searchParams.get("customerHash");
    const shop = url.searchParams.get("shop");
    const statusFilter = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    // Get shop config
    const shopConfig = await prisma.shopConfig.findUnique({
      where: { shopifyShop: shop || "" }
    });

    if (!shopConfig) {
      return Response.json(
        { error: "Shop not found" },
        { status: 404 }
      );
    }

    // Route 1: Get specific customer journey
    if (customerHash) {
      const journey = await CustomerJourneyService.getCustomerJourney(
        customerHash,
        shopConfig.id
      );

      if (!journey.summary) {
        return Response.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: journey
      });
    }

    // Route 2: Get customers by status
    if (statusFilter && ['converted', 'abandoned', 'refunded', 'all'].includes(statusFilter)) {
      const customers = await CustomerJourneyService.getCustomersByStatus(
        shopConfig.id,
        statusFilter as 'converted' | 'abandoned' | 'refunded' | 'all',
        limit
      );

      return Response.json({
        success: true,
        status: statusFilter,
        count: customers.length,
        data: customers
      });
    }

    // Route 3: Get overall analytics
    const [convertedCount, abandonedCount, refundedCount, totalCustomers] = await Promise.all([
      prisma.customerJourney.count({
        where: {
          shopConfigId: shopConfig.id,
          purchaseCount: { gt: 0 },
          totalOrdersCancelled: 0,
          totalOrdersRefunded: 0
        }
      }),
      prisma.customerJourney.count({
        where: {
          shopConfigId: shopConfig.id,
          addToCartCount: { gt: 0 },
          purchaseCount: 0
        }
      }),
      prisma.customerJourney.count({
        where: {
          shopConfigId: shopConfig.id,
          totalOrdersRefunded: { gt: 0 }
        }
      }),
      prisma.customerJourney.count({
        where: {
          shopConfigId: shopConfig.id
        }
      })
    ]);

    // Get funnel metrics
    const [pageViews, addToCart, beginCheckout, purchases] = await Promise.all([
      prisma.customerEvent.count({
        where: {
          shopConfigId: shopConfig.id,
          eventType: 'page_view'
        }
      }),
      prisma.customerEvent.count({
        where: {
          shopConfigId: shopConfig.id,
          eventType: 'add_to_cart'
        }
      }),
      prisma.customerEvent.count({
        where: {
          shopConfigId: shopConfig.id,
          eventType: 'begin_checkout'
        }
      }),
      prisma.customerEvent.count({
        where: {
          shopConfigId: shopConfig.id,
          eventType: 'purchase'
        }
      })
    ]);

    // Calculate conversion rates
    const metrics = {
      totalCustomers,
      totalConversions: convertedCount,
      totalAbandoned: abandonedCount,
      totalRefunded: refundedCount,
      conversionRate: totalCustomers > 0
        ? ((convertedCount / totalCustomers) * 100).toFixed(2)
        : 0,
      abandonmentRate: totalCustomers > 0
        ? ((abandonedCount / totalCustomers) * 100).toFixed(2)
        : 0,
      refundRate: convertedCount > 0
        ? ((refundedCount / convertedCount) * 100).toFixed(2)
        : 0,
      funnel: {
        pageViews,
        addToCart,
        beginCheckout,
        purchases,
        rates: {
          pageViewToCart: pageViews > 0
            ? ((addToCart / pageViews) * 100).toFixed(2)
            : 0,
          cartToCheckout: addToCart > 0
            ? ((beginCheckout / addToCart) * 100).toFixed(2)
            : 0,
          checkoutToConversion: beginCheckout > 0
            ? ((purchases / beginCheckout) * 100).toFixed(2)
            : 0
        }
      }
    };

    return Response.json({
      success: true,
      shop: shop,
      metrics
    });

  } catch (error) {
    console.error("Customer journey API error:", error);

    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
