import {AbstractTaxService} from "@medusajs/medusa/dist/interfaces/tax-service"
import axios from "axios"

class ZonosTaxService extends AbstractTaxService {
    static identifier = "zonos"

    constructor(options) {
        super()

        /**
         * Required Stripe options:
         *  {
         *    zonos_version: "ZONOS_VERSION", REQUIRED
         *    zonos_service_token: "ZONOS_SERVICE_TOKEN", REQUIRED
         *    zonos_default_country_origin: "COUNTRY_ORIGIN", REQUIRED
         *    zonos_default_ship_from_country: "SHIP_FROM_COUNTRY" REQUIRED
         *  }
         */
        options = {
            zonos_service_token: "40d115bd-3bc1-44a4-9f20-402c42a026cc",
            zonos_version: "2019-11-21",
            zonos_default_country_origin: "GB",
            zonos_default_ship_from_country: "GB",
        }
        this.options_ = options
    }

    async getZonosLandedCost(itemLines, shippingLines, context) {
        const headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "serviceToken": this.options_.zonos_service_token,
            "zonos-version": this.options_.zonos_version,
        }

        let items = []
        let item

        for (let itemLine of itemLines) {
            itemLine = itemLine.item
            item = {
                id: itemLine.id,
                amount: itemLine.unit_price / 100,
                country_of_origin: itemLine.variant.country_of_origin || this.options_.zonos_default_country_origin,
                quantity: itemLine.quantity,
                hs_code: itemLine.variant.hs_code,
                description_retail: `${itemLine.title} / ${itemLine.description}`,
                image_url: itemLine.thumbnail,
                duty_tax_fee_free: null,
            }
            items.push(item)
        }

        const data = {
            currency: context.region.currency_code.toUpperCase(),
            discounts: [],
            items: items,
            landed_cost: "delivery_duty_paid",
            sale_type: "not_for_resale",
            ship_from_country: items[0].country_of_origin || process.env.ZONOS_SHIP_FROM_COUNTRY,
            ship_to: {
                city: context.shipping_address.city,
                country: context.shipping_address.country_code.toUpperCase(),
                postal_code: context.shipping_address.postal_code,
            },
            shipping: {
                amount: context.shipping_methods[0].price / 100,
                amount_discount: 0,
            },
            tariff_rate: "maximum",
        }

        let taxResponse = await axios.post("https://api.zonos.com/v1/landed_cost", JSON.stringify(data), {headers}).catch(() => undefined)
        let taxes

        if (taxResponse !== undefined) {
            taxResponse = taxResponse.data
            taxes = taxResponse.taxes.map((item) => {
                if (item.type === "item") {
                    const item_amount = taxResponse.customs.items.find((e) => e.id === item.item_id).amount
                    const rate = item.amount / item_amount * 100
                    return {
                        rate: Math.round(rate),
                        name: `${item.description} ${item.formula}`,
                        code: null,
                        item_id: item.item_id,
                    }
                }

                if (item.type === "shipping") {
                    const rate = item.amount / taxResponse.customs.shipping_amount * 100
                    return {
                        rate: Math.round(rate),
                        name: `${item.description} ${item.formula}`,
                        code: null,
                        shipping_method_id: shippingLines[0].shipping_method.id,
                    }
                }
            })
        }

        return taxes
    }

    async getTaxLines(itemLines, shippingLines, context) {
        console.info(this.options_.zonos)
        let taxLines

        if (itemLines.length !== 0 && shippingLines.length !== 0 && context.shipping_address !== null) {
            taxLines = await this.getZonosLandedCost(itemLines, shippingLines, context)
        } else {
            taxLines = itemLines.flatMap((l) => {
                return l.rates.map((r) => ({
                    rate: r.rate || 0,
                    name: r.name,
                    code: r.code,
                    item_id: l.item.id,
                }))
            })
        }

        return taxLines
    }
}

export default ZonosTaxService
