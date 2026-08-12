// src/services/__fixtures__/axisEmiDebit.ts
//
// Real (redacted) Axis Bank EMI debit alert that the scanner silently
// dropped before this fix — the case that drove the recall-fix investigation.
// Two footer sentences killed it: "has not been initiated by you" tripped
// the declined/initiated reject gate, and "do not share ... CVV/OTP" tripped
// the OTP gate. Both are standard security boilerplate, not transaction
// content.

import { daysAgoMs } from './_fixtureClock'

export const AXIS_EMI_SUBJECT = 'Debit transaction alert for Axis Bank A/c'

export const AXIS_EMI_FROM = 'Axis Bank Alerts <alerts@axis.bank.in>'

export const AXIS_EMI_BODY = `AXIS BANK
05-08-2026

Dear Piyush Khandelwal,

Thank you for banking with us.

We wish to inform you that your A/c no. XX5154 has been debited with INR 42293.00 on 05-08-2026 10:02:30 IST by PPR030614052540_EMI_05-08-.

To check your available balance, please click here.

Please SMS BLOCKALL <Space> <Cust ID> to +91 9951860002, if the transaction has not been initiated by you.

Should you wish to reach us, please call 18001035577.

Always open to help you.

Regards,
Axis Bank Ltd.

****This is a system generated communication and does not require signature. ****

E001001828_07_2023


Reach us at:
Axis Bank1	Axis Bank	Axis Bank	Axis Bank	Axis Bank	Axis Bank
CHAT	WEB Support	Mobile app	INTERNET BANKING	WHATSAPP	BRANCH LOCATOR
Copyright Axis Bank Ltd. All rights reserved. Terms & Conditions apply.
Please do not share your Internet Banking details, such as user ID/password or your Credit/Debit Card number/CVV/OTP
with anyone, either over phone or through email.
RBI never deals with individuals for Savings Account, Current Account, Credit Card, Debit Card, etc. Don't be victim to such
offers coming to you on phone or email in the name of RBI.
Do not click on Links from unknown/unsecure Sources that seek your confidential information.
This email is confidential. It may also be legally privileged. If you are not the addressee, you may not copy, forward,
disclose or use any part of it. Internet communications cannot be guaranteed to be timely, secure, error or virus-free.
The sender does not accept liability for any errors or omissions. We maintain strict security standards and procedures to
prevent unauthorised access to information about you. Know more >>`

/** Base64url-encode text the way Gmail's API does for message body parts. */
function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

/** A full mocked Gmail `messages.get` response for the Axis EMI email, for integration tests. */
export function makeAxisEmiGmailMessage(id = 'msg-axis-emi-1') {
  return {
    id,
    threadId: 'thread-axis-emi-1',
    snippet: 'We wish to inform you that your A/c no. XX5154 has been debited with INR 42293.00...',
    internalDate: daysAgoMs(2),
    payload: {
      headers: [
        { name: 'Subject', value: AXIS_EMI_SUBJECT },
        { name: 'From', value: AXIS_EMI_FROM },
      ],
      mimeType: 'text/plain',
      body: { data: toBase64Url(AXIS_EMI_BODY) },
    },
  }
}
