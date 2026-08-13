// src/services/__fixtures__/liveBankAlerts.ts
//
// Real (redacted) alerts taken from the owner's own inbox on 2026-08-13, after
// a report that most transactions were still not being detected. Each one was
// dropped or mangled by the regex ladder at the time, and each failed for a
// DIFFERENT reason — which is why they are kept together as one suite:
//
//   HDFC   — "Rs. 2247.97" (a space after the abbreviation's dot) matched no
//            amount pattern at all, so the email was rejected as
//            `no_amount_in_body`. "Rs.2247.97" and "Rs 2247.97" both worked;
//            only HDFC's exact spacing failed.
//   ICICI  — the mandatory closing advisory "Never share your OTP, URN, CVV or
//            passwords with anyone" tripped the `otp_or_security_code` gate.
//            ICICI writes "has been used for a transaction of INR X" and never
//            "debited"/"paid", so the gate's payment-evidence escape hatch did
//            not open either. This is the single highest-volume alert in the
//            inbox — every card swipe sends one.
//   AXIS   — parsed, but the helpline footer's "(Toll Free)" matched the
//            Transport context keyword `toll`, filing a UPI transfer to a
//            person under Transport.
//   CRED   — carries a real List-Unsubscribe footer, so it must survive the
//            bulk-marketing gate on payment evidence alone.
//
// All four senders are on `*.bank.in`, the RBI-restricted zone Indian banks
// migrated to; none but axis.bank.in was in the trusted-domain whitelist.

import { daysAgoMs } from './_fixtureClock'

function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

export const HDFC_CARD_SUBJECT = 'A payment was made using your Credit Card'
export const HDFC_CARD_FROM = 'HDFC Bank Alerts <alerts@hdfcbank.bank.in>'
export const HDFC_CARD_BODY = `HDFC BANK

Dear Customer, Greetings from HDFC Bank. We would like to inform you that Rs. 2247.97 has been debited from your HDFC Bank Credit Card ending 7185 towards ANTHROPIC* CLAUDE SUB on 11 Aug, 2026 at 09:41:31. To check your available balance, outstanding amount, or view recent transactions, you may use: * Mycards: https://mycards.hdfc.bank.in * WhatsApp Banking Important Note: If you did not authorise this transaction, please act immediately. Your safety is our top priority, and we are here to help. What You Can Do: 1. Report Unauthorised Transaction* Call HDFC Bank Helpline at 1800 258 6161* Submit the Online Dispute Form: Click Here* Email us at: cc.disputes@hdfc.bank.in 2. Report Cyber Fraud* Visit: https://cybercrime.gov.in* Call the National Cyber Crime Helpline at 1930* File a complaint 3. Block Your Credit Card: Via NetBanking* Log in with your Customer ID and Password* Go to the 'Cards' tab* Select 'Request' > 'Credit Card Hotlisting' Via SMS * From your registered mobile number, type BLOCK CC 7185* Send it to 7308080808 Need Help? Call us at 1800 1600 or 1800 2600 (Toll-free, across India) Thank you for banking with us. Warm Regards, HDFC Bank (This is a system-generated email. Please do not reply)`

export const ICICI_CARD_SUBJECT = 'Transaction alert for your ICICI Bank Credit Card'
export const ICICI_CARD_FROM = 'ICICI Bank <credit_cards@icici.bank.in>'
export const ICICI_CARD_BODY = `ICICI Bank Online

Dear Customer, Your ICICI Bank Credit Card XX2000 has been used for a transaction of INR 286.47 on Aug 10, 2026 at 07:53:28. Info: ZOMATO. The Available Credit Limit on your card is INR 1,62,411.38 and Total Credit Limit is INR 2,50,000.00. The above limits are a total of the limits of all the Credit Cards issued to the primary card holder, including any supplementary cards. In case you have not done this transaction, to report it please call on 18002662 or SMS BLOCK space 2000 to 9215676766 from your registered mobile number and if you are outside India, call on 04071403333. In case you require any further information, you may call our Customer Care or write to us at customer.care@icicibank.com Contact your RM @ Express Relationship Banking 022-44400000. Never share your OTP, URN, CVV or passwords with anyone even if the person claims to be a bank employee. Sincerely, Team ICICI Bank

This is an auto-generated e-mail. Please do not reply. Discover a new way of paying your Credit Card bills from your bank account anytime anywhere by using ICICI Bank iMobile Pay.`

export const AXIS_UPI_SUBJECT = 'INR 53.00 was debited from your A/c no. XX5154.'
export const AXIS_UPI_FROM = 'Axis Bank <alerts@axis.bank.in>'
export const AXIS_UPI_BODY = `10-08-2026

Dear Piyush Khandelwal,

Here's the summary of your transaction:

Amount Debited: INR 53.00
Account Number: XX5154
Date & Time: 10-08-26, 21:26:57 IST
Transaction Info: UPI/P2A/113909901540/RAKESH MOHAPATRA

If this transaction was not initiated by you:
To block UPI: SMS BLOCKUPI <Customer ID> to +919951860002 from your registered mobile number.
Call us at: 18001035577 (Toll Free) 18604195555 (Charges Applicable)

Always open to help you.
Regards, Axis Bank Ltd.

****This is a system generated communication and does not require signature. ****
Copyright Axis Bank Ltd. All rights reserved. Terms & Conditions apply.
Please do not share your Internet Banking details, such as user ID/password or your Credit/Debit Card number/CVV/OTP with anyone, either over phone or through email.`

export const CRED_BILL_SUBJECT = 'your credit card bill payment was successful'
export const CRED_BILL_FROM = 'CRED <protect@cred.club>'
export const CRED_BILL_BODY = `Piyush, here is your payment confirmation Your credit card payment was successful in 34 seconds SBI 7823 payment details amount paid Rs.31,730.00 payment date Aug 12, 2026 credited to card Aug 12, 2026 transaction summary Order ID: 868PXPJWR0 Payment Method: UPI UTR No.: D9TVBEUP0C8S73CJVPM0 note Your bank will consider Aug 12, 2026 as the payment date. Banks may take up to 48 hours to send a confirmation message. What's next? Rewards: You've received exclusive rewards and CRED Coins - apply them to reduce your next bill. Pay More: Want to clear another bill? Tap "Pay more" to pay instantly. CRED PROTECT Active Your card is protected with CRED for timely reminders and hidden charge detection. latest statement detected bill amount 24th July, 2026 31,730.00 CRED protect scanned your latest statement for this card and detected no hidden charges. copyright 2025 Dreamplug Technologies Pvt Ltd. all rights reserved. unsubscribe`

interface LiveAlertSpec {
  id: string
  subject: string
  from: string
  body: string
  /** Real senders that carry a List-Unsubscribe header. */
  bulk?: boolean
}

export const LIVE_BANK_ALERTS: LiveAlertSpec[] = [
  { id: 'hdfc-card', subject: HDFC_CARD_SUBJECT, from: HDFC_CARD_FROM, body: HDFC_CARD_BODY },
  { id: 'icici-card', subject: ICICI_CARD_SUBJECT, from: ICICI_CARD_FROM, body: ICICI_CARD_BODY },
  { id: 'axis-upi', subject: AXIS_UPI_SUBJECT, from: AXIS_UPI_FROM, body: AXIS_UPI_BODY },
  { id: 'cred-bill', subject: CRED_BILL_SUBJECT, from: CRED_BILL_FROM, body: CRED_BILL_BODY, bulk: true },
]

/** A full mocked Gmail `messages.get` response for one live alert fixture. */
export function makeLiveAlertGmailMessage(spec: LiveAlertSpec) {
  const headers: Array<{ name: string; value: string }> = [
    { name: 'Subject', value: spec.subject },
    { name: 'From', value: spec.from },
  ]
  if (spec.bulk) headers.push({ name: 'List-Unsubscribe', value: '<https://cred.club/unsubscribe>' })
  return {
    id: `msg-${spec.id}`,
    threadId: `thread-${spec.id}`,
    snippet: spec.body.slice(0, 120),
    internalDate: daysAgoMs(2),
    payload: { headers, mimeType: 'text/plain', body: { data: toBase64Url(spec.body) } },
  }
}
