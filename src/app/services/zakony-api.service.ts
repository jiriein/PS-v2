import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { Injectable } from '@angular/core';

interface ApiResponse {
  Result?: {
    Title?: string;
    EffectFrom?: string;
    EffectTill?: string | null;
    [key: string]: any;
  };
  Api1?: {
    DocHead?: any;
    Error?: { httpstatuscode: number; message?: string };
    [key: string]: any;
  };
  DocHead?: any;
  Error?: { httpstatuscode: number; message?: string };
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})

export class ZakonyApiService {
  //private readonly baseUrl = 'https://www.zakonyprolidi.cz/api/v1/data.json';
  private readonly baseUrl = '/api/api/v1/data.json'; // Proxy path
  private readonly apiKey = 'test'; // Replace with your actual API key

  constructor(private http: HttpClient) {}

  /**
   * Fetches document metadata using the DocHead method.
   * @param standardized Standardized regulation text (e.g., "n.v. c. 123/2020 sb.")
   * @returns Observable with the API response
  */
  getDocHead(standardized: string): Observable<any> {
    const { collection, document } = this.parseStandardizedText(standardized);
    const url = `${this.baseUrl}/DocHead`;
    const params = {
      apikey: this.apiKey,
      Collection: collection,
      Document: document,
    };

    return this.http.get<ApiResponse>(url, { params }).pipe(
      map(response => this.handleResponse(response)),
      catchError(this.handleError)
    );
  }

  /**
   * Fetches document data using the DocData method.
   * @param collection Collection identifier (e.g., "cs")
   * @param document Document identifier (e.g., "2006-262")
   * @returns Observable with the API response
  */
getDocData(collection: string, document: string): Observable<any> {
  const url = `${this.baseUrl}/DocData`;
  const params = {
    apikey: this.apiKey,
    Collection: collection,
    Document: document,
  };

  return this.http.get<ApiResponse>(url, { params }).pipe(
    map(response => this.handleResponse(response)),
    catchError(this.handleError)
  );
}

  /**
   * Parses standardized text into Collection and Document parameters.
   * @param standardized Standardized text (e.g., "n.v. c. 123/2020 sb.")
   * @returns Object with collection and document
  */
  public parseStandardizedText(standardized: string): { collection: string; document: string } {
    // Extract prefix and number (e.g., "n.v. c. 123/2020 sb." -> prefix: "n.v.", number: "123/2020")
    const match = standardized.match(/^(n\.v\.|z\.|v\.)\s*c\.\s*(\d{2,4}\/\d{2,4})\s*sb\.$/i);
    if (!match) {
      throw new Error('Invalid standardized format');
    }

    const prefix = match[1]; // e.g., "n.v.", "z.", "v."
    const number = match[2]; // e.g., "123/2020"

    // Map prefix to Collection
    let collection: string;
    switch (prefix.toLowerCase()) {
      case 'n.v.':        // nařízení vlády
        collection = 'cs';
        break;
      case 'z.':          // zákon
        collection = 'cs';
        break;
      case 'v.':          // vyhláška
        collection = 'cs';
        break;
      default:            // Default to Czech collection
        collection = 'cs';
    }

    // Format Document as "YYYY-NNN" (e.g., "123/2020" -> "2020-123")
    const [num, year] = number.split('/');
    const document = `${year}-${num}`;

    return { collection, document };
  }

  /**
   * Processes the API response, extracting the result or throwing an error.
   * @param response API response
   * @returns Extracted result
  */
  private handleResponse(response: ApiResponse): any {
    console.log('Raw API response:', response); // Debug log
    if (!response) {
      throw new Error('API error: Empty response');
    }
    // Check for Result (new structure)
    if (response.Result) {
      return response.Result;
    }

    // Check for direct Error or DocHead at root
    if (response.Error && response.Error.httpstatuscode !== 200) {
      throw new Error(`API error: ${response.Error.message || 'Unknown error'} (HTTP ${response.Error.httpstatuscode})`);
    }
    if (response.DocHead) {
      return response.DocHead;
    }

    // Check Api1 structure
    const result = response.Api1;
    if (!result) {
      throw new Error('API error: Invalid response structure (missing Result or Api1)');
    }
    if (result.Error && result.Error.httpstatuscode !== 200) {
      throw new Error(`API error: ${result.Error.message || 'Unknown error'} (HTTP ${result.Error.httpstatuscode})`);
    }
    return result.DocHead || result;
  }

  /**
   * Handles HTTP errors.
   * @param error HttpErrorResponse
   * @returns Observable with error
  */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.status === 500) {
        errorMessage = `Server error: HTTP 500 - Internal Server Error. Wrong API key or the document may not exist.`;
      } else {
        errorMessage = `Server error: ${error.status} - ${error.message}`;
      }
      if (error.error?.Api1?.Error) {
        errorMessage = `API error: ${error.error.Api1.Error.message || 'Unknown error'} (HTTP ${error.error.Api1.Error.httpstatuscode})`;
      }
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}