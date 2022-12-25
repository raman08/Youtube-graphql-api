import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const prisma = new PrismaClient();

const API_KEY = process.env.API_KEY;

let pageToken = '';

// Reading grphql schema
const typeDefs = readFileSync('./src/schema.graphql', { encoding: 'utf-8' });

const resolvers = {
	Query: {
		videos: async (_, { page = 1, pageSize = 10 }) => {
			try {
				// Requesting prisna to get videos from database orderBy publish date
				const videos = await prisma.video.findMany({
					skip: (page - 1) * pageSize,
					take: pageSize || 10,
					orderBy: { publishedAt: 'desc' },
				});

				return videos;
			} catch (error) {
				console.log(error);
			}
		},
		search: async (_, { query, page = 1, pageSize = 10 }) => {
			try {
				// Requesting prisma to get results containing string querty in title or description
				const videos = await prisma.video.findMany({
					where: {
						OR: [
							{ title: { contains: query || undefined } },
							{ description: { contains: query || undefined } },
						],
					},
					skip: (page - 1) * pageSize,
					take: pageSize || 10,
					orderBy: { publishedAt: 'desc' },
				});

				return videos;
			} catch (error) {
				console.log(error);
			}
		},
	},

	Mutation: {
		fetchVideos: async (
			_,
			{ query = 'cricket', order = 'date', maxResults = 10 }
		) => {
			try {
				// Requesting youtube api for videos
				const response = await axios.get(
					'https://www.googleapis.com/youtube/v3/search',
					{
						params: {
							key: API_KEY,
							q: query,
							order: order,
							maxResults: maxResults,
							pageToken: pageToken,
							part: 'snippet',
						},
					}
				);

				// Extract the list of videos and the next page token from the response.
				const videos = response.data.items;
				pageToken = response.data.nextPageToken || '';

				// Store the data for each video in the database.
				for (const video of videos) {
					const vd = await prisma.video.findFirst({
						where: { videoId: video.id.videoId },
					});

					if (vd) {
						// console.log('Video found:', vd.id);
						continue;
					}

					// console.log(`Adding ${video.snippet.title}`);

					await prisma.video.create({
						data: {
							title: video.snippet.title,
							description: video.snippet.description,
							publishedAt: video.snippet.publishedAt,
							thumbnail: video.snippet.thumbnails.default.url,
							videoId: video.id.videoId,
						},
					});
				}

				return 'Success';
			} catch (error) {
				console.error(error);
				return 'Something went wrong!';
			}
		},
	},
};

const server = new ApolloServer({
	typeDefs,
	resolvers,
});

const { url } = await startStandaloneServer(server, {
	listen: { port: 4000 },
});

console.log(`🚀  Server ready at: ${url}`);
