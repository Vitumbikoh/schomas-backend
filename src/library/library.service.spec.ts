import { LibraryService } from './library.service';

const now = new Date();

describe('LibraryService.returnBook', () => {
  let service: LibraryService;
  const bookRepo: any = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (b) => b),
  };
  const borrowRepo: any = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (b) => b),
  };
  const studentRepo: any = {};
  const classRepo: any = {};

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LibraryService(bookRepo, borrowRepo, studentRepo, classRepo);
  });

  it('marks a non-returned borrowing as returned and restores availableCopies', async () => {
    const br = { id: 'br1', bookId: 'book1', schoolId: 'school1', returnedAt: null } as any;
    const book = { id: 'book1', availableCopies: 1 } as any;

    borrowRepo.findOne.mockResolvedValueOnce(br);
    bookRepo.findOne.mockResolvedValueOnce(book);

    const res = await service.returnBook({ borrowingId: 'br1' }, { role: 'admin', schoolId: 'school1' });

    expect(res.returnedAt).toBeDefined();
    expect(bookRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'book1', availableCopies: 2 }));
    expect(borrowRepo.save).toHaveBeenCalled();
  });

  it('returns existing borrowing unchanged when already returned (idempotent)', async () => {
    const returnedDate = new Date('2026-02-18T10:00:00Z');
    const br = { id: 'br2', bookId: 'book1', schoolId: 'school1', returnedAt: returnedDate } as any;

    borrowRepo.findOne.mockResolvedValueOnce(br);

    const res = await service.returnBook({ borrowingId: 'br2' }, { role: 'admin', schoolId: 'school1' });

    expect(res).toBe(br);
    expect(bookRepo.findOne).not.toHaveBeenCalled();
    expect(bookRepo.save).not.toHaveBeenCalled();
    expect(borrowRepo.save).not.toHaveBeenCalled();
  });
});
