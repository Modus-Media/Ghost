const errors = require('@tryghost/errors');
// const _ = require('lodash');

/**
 * Handles `invoice.payment_succeeded` webhook events
 * 
 * The `invoice.payment_succeeded` event is triggered when a customer's payment succeeds.
 */
module.exports = class InvoiceEventService {
    /**
     * @param {object} deps
     * @param {object} deps.api
     * @param {object} deps.memberRepository
     * @param {object} deps.eventRepository
     * @param {object} deps.productRepository
     */
    constructor(deps) {
        this.deps = deps;
    }

    /**
     * Handles a `invoice.payment_succeeded` event
     * 
     * Inserts a payment event into the database
     * @param {import('stripe').Stripe.Invoice} invoice
     */
    async handleInvoiceEvent(invoice) {
        const {api, memberRepository, eventRepository, productRepository} = this.deps;

        if (!invoice.subscription) {
            // Check if this is a one time payment, related to a donation
            // this is being handled in checkoutSessionEvent because we need to handle the custom donation message
            // which is not available in the invoice object
            return;
        }
        const subscription = await api.getSubscription(invoice.subscription, {
            expand: ['default_payment_method']
        });

        const member = await memberRepository.get({
            customer_id: subscription.customer
        });

        if (member) {
            if (invoice.paid && invoice.amount_paid !== 0) {
                await eventRepository.registerPayment({
                    member_id: member.id,
                    currency: invoice.currency,
                    amount: invoice.amount_paid
                });
            }
        } else {
            // Subscription has more than one plan - meaning it is not one created by us - ignore.
            if (!subscription.plan) {
                return;
            }
            // Subscription is for a different product - ignore.
            const product = await productRepository.get({
                stripe_product_id: subscription.plan.product
            });
            if (!product) {
                return;
            }
            // Could not find the member, which we need in order to insert an payment event.
            throw new errors.NotFoundError({
                message: `No member found for customer ${subscription.customer}`
            });
        }
    }
};
