import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { Injectable } from '@angular/core';

interface ApiResponse {
  Api1: {
    DocHead?: any; // API response data for DocHead method
    Error?: { httpstatuscode: number; message?: string };
    [key: string]: any; // Allow other dynamic keys
  };
}

@Injectable({
  providedIn: 'root',
})
export class ZakonyApiService {
  private readonly baseUrl = 'https://www.zakonyprolidi.cz/api/v1/data.json';
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
   * Parses standardized text into Collection and Document parameters.
   * @param standardized Standardized text (e.g., "n.v. c. 123/2020 sb.")
   * @returns Object with collection and document
   */
  private parseStandardizedText(standardized: string): { collection: string; document: string } {
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
      case 'n.v.':
        collection = 'cs'; // Regulation (nařízení vlády)
        break;
      case 'z.':
        collection = 'cs'; // Law (zákon)
        break;
      case 'v.':
        collection = 'cs'; // Decree (vyhláška)
        break;
      default:
        collection = 'cs'; // Default to Czech collection
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
    const result = response.Api1;
    if (result.Error && result.Error.httpstatuscode !== 200) {
      throw new Error(`API error: ${result.Error.message || 'Unknown error'} (HTTP ${result.Error.httpstatuscode})`);
    }
    return result['DocHead'] || result; // Return DocHead data or full result
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
      errorMessage = `Server error: ${error.status} - ${error.message}`;
      if (error.error?.Api1?.Error) {
        errorMessage = `API error: ${error.error.Api1.Error.message || 'Unknown error'} (HTTP ${error.error.Api1.Error.httpstatuscode})`;
      }
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}