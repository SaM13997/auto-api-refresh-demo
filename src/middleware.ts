import { NextRequest, NextResponse } from 'next/server'
import prisma from './lib/prisma'
import { unixTimestampToDate, urlBase64Decode } from './utils/utils'

import type { AuthTokenResp } from './types/index'

const middleware = async (request: NextRequest) => {
	try {
		// Get the latest token in the database
		const mostRecentApiToken = await prisma.apiToken.findFirst({
			orderBy: {
				addedOn: 'desc',
			},
		})

		if (mostRecentApiToken) {
			const { accessToken, expirationDate, refreshToken } = mostRecentApiToken

			const tokenExpirationDate = new Date(expirationDate)
			const currentDate = new Date()

			// compare the current date to the expiration date
			if (currentDate > tokenExpirationDate) {
				console.log('the token is expired - get a new one')

				const url =
					'https://prod.trackmania.core.nadeo.online/v2/authentication/token/basic'
				const login = process.env.TM_SERVER_ACCOUNT_LOGIN
				const password = process.env.TM_SERVER_ACCOUNT_PASSWORD

				// Fetch a new token if current time is greater than exp time
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Basic ${btoa(`${login}:${password}`)}`,
					},
					body: JSON.stringify({
						audience: 'NadeoLiveServices',
					}),
				})

				if (!res.ok) {
					const text = await res.text() // get the response body for more information

					throw new Error(`
            Failed to fetch data
            Status: ${res.status}
            Response: ${text}
          `)
				}

				// Parse the newToken from the fetch request:
				const newTokens: AuthTokenResp = await res.json()
				const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
					newTokens

				const [header, payload, structure] = newAccessToken.split('.')
				// Decoding the payload part of the token to get the data obj that contains the expiry time and refetch time to get a new token:
				const { exp, rat } = urlBase64Decode(payload)
				const newExpirationDate = unixTimestampToDate(rat)

				// Push the new token to the DB
				await prisma.apiToken.create({
					data: {
						accessToken: newAccessToken,
						expirationDate: newExpirationDate,
						refreshToken: newRefreshToken,
						addedOn: new Date(),
					},
				})
			}

			console.log('the token is valid - you good!')

			// set a new response header "Authorization"
			const response = NextResponse.next()
			response.headers.set('Authorization', `nadeo_v1 t=${accessToken}`)
			return response
		}
	} catch (error) {
		return NextResponse.json(
			{
				message: 'Something went wrong!',
			},
			{
				status: 500,
			}
		)
	}
}

export { middleware }
