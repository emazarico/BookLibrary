import type { Book, UserProfile } from '../types/library';
import { cleanGoodreadsIsbn } from './csv';

export interface DuplicateMatchItem {
  book: Book;
  ownerName: string;
  ownerEmoji: string;
}

export interface DuplicateCheckResult {
  ownMatches: Book[];
  householdMatches: DuplicateMatchItem[];
}

function normalizeTitleAuthor(title: string, author: string): string {
  return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`;
}

export function findBookDuplicates(
  candidate: {
    title: string;
    author: string;
    isbn?: string;
    excludeBookId?: string;
  },
  allBooks: Book[],
  profiles: UserProfile[],
  activeProfileId: string | null,
): DuplicateCheckResult {
  const cleanIsbn = cleanGoodreadsIsbn(candidate.isbn);
  const trimmedTitle = candidate.title.trim();
  const titleAuthorKey = trimmedTitle
    ? normalizeTitleAuthor(candidate.title, candidate.author || '')
    : '';

  if (!cleanIsbn && !titleAuthorKey) {
    return { ownMatches: [], householdMatches: [] };
  }

  const profileMap = new Map(
    profiles.filter((p) => !p.deletedAt).map((p) => [p.id, p]),
  );

  const ownMatches: Book[] = [];
  const householdMatches: DuplicateMatchItem[] = [];

  for (const book of allBooks) {
    if (book.deletedAt) continue;
    if (candidate.excludeBookId && book.id === candidate.excludeBookId) continue;

    const bookIsbn = cleanGoodreadsIsbn(book.isbn);
    const isbnMatched = Boolean(cleanIsbn && bookIsbn && cleanIsbn === bookIsbn);
    const titleAuthorMatched = Boolean(
      titleAuthorKey &&
        normalizeTitleAuthor(book.title, book.author) === titleAuthorKey,
    );

    if (!isbnMatched && !titleAuthorMatched) continue;

    if (activeProfileId && book.profileId === activeProfileId) {
      ownMatches.push(book);
    } else {
      const owner = profileMap.get(book.profileId);
      if (owner) {
        householdMatches.push({
          book,
          ownerName: owner.name,
          ownerEmoji: owner.avatarEmoji,
        });
      }
    }
  }

  return { ownMatches, householdMatches };
}
