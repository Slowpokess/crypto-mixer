import { BaseRepository } from './BaseRepository';
import { Model, ModelStatic, Sequelize } from 'sequelize';

// Мок модель для тестирования
class TestModel extends Model {}

// Тестовый репозиторий
class TestRepository extends BaseRepository<TestModel> {
  // Публичные методы для тестирования приватных методов
  public testValidateData(data: any): void {
    return this.validateData(data);
  }

  public async testRawQuery(sql: string, replacements?: Record<string, any>): Promise<any> {
    return this.rawQuery(sql, replacements);
  }
}

describe('BaseRepository Security Tests', () => {
  let repository: TestRepository;
  let mockModel: jest.Mocked<ModelStatic<TestModel>>;

  beforeEach(() => {
    // Создаем мок модель
    mockModel = {
      name: 'TestModel',
      sequelize: {
        query: jest.fn()
      } as any
    } as jest.Mocked<ModelStatic<TestModel>>;

    repository = new TestRepository(mockModel);
  });

  describe('SQL Injection Protection', () => {
    test('должен блокировать DROP statements', async () => {
      const maliciousSQL = "SELECT * FROM users; DROP TABLE users;";
      
      await expect(repository.testRawQuery(maliciousSQL))
        .rejects
        .toThrow('Multiple statements in single query are not allowed');
    });

    test('должен блокировать UNION injection', async () => {
      const maliciousSQL = "SELECT * FROM users WHERE id = 1 UNION SELECT password FROM admin";
      
      await expect(repository.testRawQuery(maliciousSQL))
        .rejects
        .toThrow('SQL query contains potentially dangerous pattern');
    });

    test('должен блокировать OR-based injection', async () => {
      const maliciousSQL = "SELECT * FROM users WHERE name = 'admin' OR '1'='1'";
      
      await expect(repository.testRawQuery(maliciousSQL))
        .rejects
        .toThrow('SQL query contains potentially dangerous pattern');
    });

    test('должен разрешать безопасные SELECT запросы', async () => {
      const safeSQL = "SELECT id, name FROM users WHERE status = :status";
      const replacements = { status: 'active' };

      mockModel.sequelize!.query = jest.fn().mockResolvedValue([]);
      
      await expect(repository.testRawQuery(safeSQL, replacements))
        .resolves
        .not.toThrow();
    });

    test('должен блокировать не-SELECT запросы в rawQuery', async () => {
      const insertSQL = "INSERT INTO users (name) VALUES ('test')";
      
      await expect(repository.testRawQuery(insertSQL))
        .rejects
        .toThrow('Only SELECT queries are allowed in rawQuery method');
    });

    test('должен валидировать replacement параметры', async () => {
      const sql = "SELECT * FROM users WHERE id = :userId";
      const maliciousReplacements = {
        'userId; DROP TABLE users;': '1'
      };
      
      await expect(repository.testRawQuery(sql, maliciousReplacements))
        .rejects
        .toThrow('Invalid replacement key');
    });
  });

  describe('Data Validation', () => {
    test('должен блокировать опасные объекты с __proto__', () => {
      const maliciousData = {
        name: 'test',
        '__proto__': { admin: true }
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('Reserved word used as key');
    });

    test('должен блокировать XSS в строках', () => {
      const maliciousData = {
        comment: '<script>alert("XSS")</script>'
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('String contains dangerous pattern');
    });

    test('должен блокировать слишком глубокую вложенность', () => {
      let deepObject: any = {};
      let current = deepObject;
      
      // Создаем объект с глубиной 15 уровней
      for (let i = 0; i < 15; i++) {
        current.next = {};
        current = current.next;
      }
      
      expect(() => repository.testValidateData(deepObject))
        .toThrow('Object nesting too deep');
    });

    test('должен блокировать слишком длинные строки', () => {
      const maliciousData = {
        description: 'A'.repeat(10001) // Превышает лимит 10000
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('String too long');
    });

    test('должен блокировать слишком большие массивы', () => {
      const maliciousData = {
        items: new Array(1001).fill('test') // Превышает лимит 1000
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('Array too long');
    });

    test('должен принимать валидные данные', () => {
      const validData = {
        name: 'John Doe',
        age: 30,
        active: true,
        createdAt: new Date(),
        tags: ['user', 'verified'],
        metadata: {
          preferences: {
            theme: 'dark'
          }
        }
      };
      
      expect(() => repository.testValidateData(validData))
        .not.toThrow();
    });

    test('должен блокировать недопустимые типы', () => {
      const maliciousData = {
        name: 'test',
        callback: function() { return 'hack'; }
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('Invalid value type');
    });

    test('должен блокировать control characters', () => {
      const maliciousData = {
        name: 'test\x00admin'
      };
      
      expect(() => repository.testValidateData(maliciousData))
        .toThrow('String contains dangerous pattern');
    });
  });

  describe('Security Boundaries', () => {
    test('должен блокировать слишком большие объекты', () => {
      const largeData = {
        content: 'X'.repeat(99999) // Почти 100KB
      };
      
      expect(() => repository.testValidateData(largeData))
        .toThrow('Data object is too large');
    });

    test('должен валидировать даты в разумных пределах', () => {
      const invalidData = {
        birthDate: new Date('1800-01-01') // Слишком старая дата
      };
      
      expect(() => repository.testValidateData(invalidData))
        .toThrow('Date out of range');
    });

    test('должен блокировать бесконечные числа', () => {
      const invalidData = {
        score: Infinity
      };
      
      expect(() => repository.testValidateData(invalidData))
        .toThrow('Invalid number');
    });
  });
});