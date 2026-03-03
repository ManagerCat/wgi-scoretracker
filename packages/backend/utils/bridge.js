const bridgeUrl = "https://bridge.competitionsuite.com/api/orgscores/GetCompetitionsBySeason/jsonp?season="
export async function getCompetitions(season) {
    const response = await fetch(bridgeUrl + season, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    });
    const data = await response.json();
    const competitionGuids = data.competitions.map(competition => {
        return competition.competitionGuid
    });
    return competitionGuids
}
