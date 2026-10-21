jest.mock('../../../config/firebaseConfig',()=>({auth:{currentUser:null},firestore:{}}));
import {fetchVenueDetails,fetchVenueDetailsByName} from '../firestoreEvents';
const originalFetch=global.fetch,request=jest.fn(),response=(payload:any)=>({ok:true,json:async()=>payload});
beforeEach(()=>{global.fetch=request;request.mockReset();});afterEach(()=>{global.fetch=originalFetch;});
it('uses the exact selected venue ID endpoint without searching other venues',async()=>{
  request.mockResolvedValue(response({venue:{id:'slug_ccoagallery',website:'https://selected.example/'}}));
  expect((await fetchVenueDetails('slug_ccoagallery'))?.website).toBe('https://selected.example/');
  expect(String(request.mock.calls[0][0])).toContain('/venues/slug_ccoagallery');expect(request).toHaveBeenCalledTimes(1);
});
it.each(['','  '])('does not search for an empty venue identity %p',async name=>{
  expect(await fetchVenueDetailsByName(name)).toBeNull();expect(request).not.toHaveBeenCalled();
});
it('rejects substring and blank-name fallback that previously returned another venue contact',async()=>{
  request.mockResolvedValue(response({venues:[{id:'empty',pagename:'',website:'https://wrong.example/'},
    {id:'parent',pagename:'Gallery Annex',website:'https://wrong.example/'}]}));
  expect(await fetchVenueDetailsByName('Gallery')).toBeNull();
});
it('checks every venue page before accepting a unique exact case-insensitive name',async()=>{
  request.mockResolvedValueOnce(response({venues:[{id:'wrong',pagename:'Other venue'}],nextPageToken:'next cursor'}))
    .mockResolvedValueOnce(response({venues:[{id:'right',pagename:'  Gallery ',website:'https://selected.example/'}]}));
  expect((await fetchVenueDetailsByName('gallery'))?.website).toBe('https://selected.example/');
  expect(String(request.mock.calls[1][0])).toContain('startAfter=next%20cursor');
});
it('holds an ambiguous exact name across pages instead of selecting the first',async()=>{
  request.mockResolvedValueOnce(response({venues:[{id:'a',pagename:'Gallery',website:'https://a.example/'}],nextPageToken:'next'}))
    .mockResolvedValueOnce(response({venues:[{id:'b',title:'Gallery',website:'https://b.example/'}]}));
  expect(await fetchVenueDetailsByName('Gallery')).toBeNull();
});
it('stops a repeated paging token rather than using incomplete or looping contact search',async()=>{
  request.mockResolvedValue(response({venues:[{id:'a',pagename:'Gallery'}],nextPageToken:'repeat'}));
  expect(await fetchVenueDetailsByName('Gallery')).toBeNull();expect(request).toHaveBeenCalledTimes(2);
});
